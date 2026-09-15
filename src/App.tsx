import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import "./App.css";

/* -------------------------------------------------------------
   타입 정의
   ------------------------------------------------------------- */
type ThemeId = "sunset" | "ocean" | "forest" | "blossom" | "mono";
type RepeatMode = "count" | "infinite";
type Phase = "focus" | "break" | "done";
type View = "settings" | "timer";

interface Theme {
  id: ThemeId;
  name: string;
  focus: string;
  breakColor: string;
}

interface StoredSettings {
  focusMinutes: number;
  breakMinutes: number;
  repeatMode: RepeatMode;
  repeatCount: number;
  alarmEnabled: boolean;
  themeId: ThemeId;
}

/* -------------------------------------------------------------
   테마 팔레트 (집중색 + 휴식색 한 쌍)
   ------------------------------------------------------------- */
const THEMES: Theme[] = [
  { id: "sunset", name: "Sunset", focus: "#E8604C", breakColor: "#4C9E8E" },
  { id: "ocean", name: "Ocean", focus: "#2E6F95", breakColor: "#7FC8A9" },
  { id: "forest", name: "Forest", focus: "#4C6B4F", breakColor: "#A9BE6E" },
  { id: "blossom", name: "Blossom", focus: "#D46A9F", breakColor: "#F2B3B3" },
  { id: "mono", name: "Mono", focus: "#2B2B2B", breakColor: "#6E6E6E" },
];

const STORAGE_KEY = "pomodoro-settings";
const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function loadSettings(): StoredSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSettings;
  } catch {
    return null;
  }
}

/* Web Audio API로 짧은 알림음 재생 (별도 사운드 파일 불필요) */
function playBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.55);
    oscillator.onended = () => ctx.close();
  } catch {
    /* Web Audio 미지원 환경은 조용히 무시 */
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
function useIsInstalled() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");

    const checkInstalled = () => {
      const isStandalone =
        standaloneQuery.matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    checkInstalled();
    standaloneQuery.addEventListener("change", checkInstalled);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      standaloneQuery.removeEventListener("change", checkInstalled);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const promptInstall = async () => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);
  };

  return { isInstalled, canInstall, promptInstall };
}
function useDraftNumber(
  value: number,
  setValue: (next: number) => void,
  min = 1,
) {
  const [draft, setDraft] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  const onBlur = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft === "" || Number.isNaN(parsed)) {
      setValue(min);
    } else {
      setValue(Math.max(min, Math.floor(parsed)));
    }
    setDraft(null);
  };

  return { value: draft ?? String(value), onChange, onBlur };
}

/* 커스텀 CSS 변수를 style에 넣기 위한 확장 타입 */
type ThemeStyle = CSSProperties & {
  "--focus-color"?: string;
  "--break-color"?: string;
  "--phase-color"?: string;
};

export default function App() {
  const saved = loadSettings();

  /* ---------------- 설정값 ---------------- */
  const [focusMinutes, setFocusMinutes] = useState<number>(
    saved?.focusMinutes ?? 25,
  );
  const [breakMinutes, setBreakMinutes] = useState<number>(
    saved?.breakMinutes ?? 5,
  );
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(
    saved?.repeatMode ?? "count",
  );
  const [repeatCount, setRepeatCount] = useState<number>(
    saved?.repeatCount ?? 4,
  );
  const [alarmEnabled, setAlarmEnabled] = useState<boolean>(
    saved?.alarmEnabled ?? true,
  );
  const [themeId, setThemeId] = useState<ThemeId>(saved?.themeId ?? "sunset");

  /* ---------------- 실행 상태 ---------------- */
  const [view, setView] = useState<View>("settings");
  const [currentPhase, setCurrentPhase] = useState<Phase>("focus");
  const [currentSession, setCurrentSession] = useState<number>(1);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    focusMinutes * 60,
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const theme: Theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  /* 설정값 변경 시 localStorage 저장 */
  useEffect(() => {
    const settings: StoredSettings = {
      focusMinutes,
      breakMinutes,
      repeatMode,
      repeatCount,
      alarmEnabled,
      themeId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [
    focusMinutes,
    breakMinutes,
    repeatMode,
    repeatCount,
    alarmEnabled,
    themeId,
  ]);

  /* ---------------- 타이머 카운트다운 ---------------- */
  useEffect(() => {
    if (!isRunning) return undefined;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  /* 0초에 도달하면 다음 단계로 전환 */
  useEffect(() => {
    if (remainingSeconds !== 0 || !isRunning) return;

    if (alarmEnabled) playBeep();

    if (currentPhase === "focus") {
      setCurrentPhase("break");
      setRemainingSeconds(breakMinutes * 60);
      return;
    }

    if (currentPhase === "break") {
      const finished = repeatMode === "count" && currentSession >= repeatCount;
      if (finished) {
        setCurrentPhase("done");
        setIsRunning(false);
      } else {
        setCurrentSession((s) => s + 1);
        setCurrentPhase("focus");
        setRemainingSeconds(focusMinutes * 60);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  /* ---------------- 핸들러 ---------------- */
  const clampMinutes = (n: number): number => Math.max(1, n);
  const handleStart = (): void => {
    setCurrentPhase("focus");
    setCurrentSession(1);
    setRemainingSeconds(focusMinutes * 60);
    setIsRunning(true);
    setView("timer");
  };

  const handleTogglePause = (): void => setIsRunning((r) => !r);

  const handleReset = (): void => {
    setIsRunning(false);
    setRemainingSeconds(
      currentPhase === "break" ? breakMinutes * 60 : focusMinutes * 60,
    );
  };

  const handleBackToSettings = (): void => {
    setIsRunning(false);
    setView("settings");
  };

  const handleRestart = (): void => {
    setView("settings");
    setCurrentPhase("focus");
    setCurrentSession(1);
  };

  /* ---------------- 파생값 ---------------- */
  const focusField = useDraftNumber(focusMinutes, setFocusMinutes);
  const breakField = useDraftNumber(breakMinutes, setBreakMinutes);
  const repeatCountField = useDraftNumber(repeatCount, setRepeatCount);
  const totalForPhase =
    currentPhase === "break" ? breakMinutes * 60 : focusMinutes * 60;
  const progressFraction =
    totalForPhase > 0 ? remainingSeconds / totalForPhase : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progressFraction);
  const phaseColor = currentPhase === "break" ? theme.breakColor : theme.focus;
  const phaseLabel = currentPhase === "break" ? "휴식 중" : "집중 중";

  const rootStyle: ThemeStyle = {
    "--focus-color": theme.focus,
    "--break-color": theme.breakColor,
    "--phase-color": phaseColor,
  };
  const { isInstalled, canInstall, promptInstall } = useIsInstalled();

  const handleInstallClick = async (): Promise<void> => {
    await promptInstall();
  };
  return (
    <div className="app" style={rootStyle}>
      <main className="card">
        {view === "settings" && (
          <section className="screen screen--settings">
            <header className="screen__header">
              <span className="brand">🔥 Pomodoro</span>
            </header>

            <div className="field">
              <label className="field__label">집중 시간</label>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="집중 시간 줄이기"
                  onClick={() => setFocusMinutes((m) => clampMinutes(m - 1))}
                >
                  −
                </button>
                <span className="stepper__value">
                  <input
                    type="number"
                    className="stepper__num-input"
                    min={1}
                    value={focusField.value}
                    onChange={focusField.onChange}
                    onBlur={focusField.onBlur}
                    aria-label="집중 시간 직접 입력"
                  />
                  <span className="stepper__unit">분</span>
                </span>
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="집중 시간 늘리기"
                  onClick={() => setFocusMinutes((m) => clampMinutes(m + 1))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field__label">휴식 시간</label>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="휴식 시간 줄이기"
                  onClick={() => setBreakMinutes((m) => clampMinutes(m - 1))}
                >
                  −
                </button>
                <span className="stepper__value">
                  <input
                    type="number"
                    className="stepper__num-input"
                    min={1}
                    value={breakField.value}
                    onChange={breakField.onChange}
                    onBlur={breakField.onBlur}
                    aria-label="휴식 시간 직접 입력"
                  />
                  <span className="stepper__unit">분</span>
                </span>
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="휴식 시간 늘리기"
                  onClick={() => setBreakMinutes((m) => clampMinutes(m + 1))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field__label">반복</label>
              <div className="repeat">
                <div className="pillgroup">
                  <button
                    type="button"
                    className={`pillgroup__label ${repeatMode === "count" ? "is-active" : ""}`}
                    onClick={() => setRepeatMode("count")}
                  >
                    N회 반복
                  </button>
                  <button
                    type="button"
                    className={`pillgroup__label ${repeatMode === "infinite" ? "is-active" : ""}`}
                    onClick={() => setRepeatMode("infinite")}
                  >
                    끌 때까지
                  </button>
                </div>
                <div
                  className={`repeat__count ${repeatMode === "infinite" ? "is-disabled" : ""}`}
                >
                  <input
                    type="number"
                    className="repeat__input"
                    min={1}
                    value={repeatCountField.value}
                    disabled={repeatMode === "infinite"}
                    onChange={repeatCountField.onChange}
                    onBlur={repeatCountField.onBlur}
                    aria-label="반복 횟수"
                  />
                  <span className="repeat__count-unit">회</span>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field__label">테마</label>
              <div className="themepicker">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`themepicker__swatch ${themeId === t.id ? "is-active" : ""}`}
                    style={{
                      background: `linear-gradient(135deg, ${t.focus} 50%, ${t.breakColor} 50%)`,
                    }}
                    aria-label={`${t.name} 테마`}
                    onClick={() => setThemeId(t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="field field--row">
              <label className="field__label" htmlFor="alarm-toggle">
                알림 소리
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  id="alarm-toggle"
                  checked={alarmEnabled}
                  onChange={(e) => setAlarmEnabled(e.target.checked)}
                />
                <span className="switch__track">
                  <span className="switch__thumb" />
                </span>
              </label>
            </div>

            <button
              type="button"
              className="button button--primary"
              onClick={handleStart}
            >
              시작하기
            </button>
          </section>
        )}

        {view === "timer" && currentPhase !== "done" && (
          <section className="screen screen--timer">
            <button
              type="button"
              className="corner-btn"
              aria-label="설정"
              onClick={handleBackToSettings}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
              </svg>
            </button>

            {repeatMode === "count" ? (
              repeatCount > 10 ? (
                <div className="session-indicator session-indicator--text">
                  ({currentSession}/{repeatCount})
                </div>
              ) : (
                <div className="session-indicator session-indicator--count">
                  {Array.from({ length: repeatCount }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        "dot" +
                        (i < currentSession - 1 ? " dot--done" : "") +
                        (i === currentSession - 1 ? " dot--current" : "")
                      }
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="session-indicator session-indicator--infinite">
                <span className="infinity">∞</span>
                <span className="session-indicator__count">
                  {currentSession}회차
                </span>
              </div>
            )}

            <div className="dial">
              <svg className="dial__ring" viewBox="0 0 200 200">
                <circle
                  className="dial__track"
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                />
                <circle
                  className="dial__progress"
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  style={{
                    strokeDasharray: RING_CIRCUMFERENCE,
                    strokeDashoffset: dashOffset,
                  }}
                />
              </svg>
              <div className="dial__readout">
                <span className="dial__time">
                  {formatTime(remainingSeconds)}
                </span>
                <span className="dial__phase">{phaseLabel}</span>
              </div>
            </div>

            <div className="controls">
              <button
                type="button"
                className="button button--ghost"
                aria-label="리셋"
                onClick={handleReset}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 1 3 6.7" />
                  <path d="M3 4v6h6" />
                </svg>
              </button>

              <button
                type="button"
                className="button button--play"
                aria-label={isRunning ? "일시정지" : "재생"}
                onClick={handleTogglePause}
              >
                {isRunning ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5l12 7-12 7V5z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={`button button--ghost ${alarmEnabled ? "is-active" : ""}`}
                aria-label={alarmEnabled ? "알림 소리 끄기" : "알림 소리 켜기"}
                onClick={() => setAlarmEnabled((a) => !a)}
              >
                {alarmEnabled ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 8a6 6 0 0 0-9.33-5" />
                    <path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14" />
                    <path d="M18 14v-2" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                )}
              </button>
            </div>
          </section>
        )}

        {view === "timer" && currentPhase === "done" && (
          <section className="screen screen--done">
            <span className="done__emoji">🎉</span>
            <h2 className="done__title">{repeatCount}세션 완료!</h2>
            <p className="done__sub">오늘도 수고하셨어요.</p>
            <button
              type="button"
              className="button button--primary"
              onClick={handleRestart}
            >
              다시 시작하기
            </button>
          </section>
        )}
        {!isInstalled && canInstall && view === "settings" && (
          <button
            type="button"
            className="button button-app"
            onClick={handleInstallClick}
          >
            앱 설치하기
          </button>
        )}
      </main>
    </div>
  );
}
