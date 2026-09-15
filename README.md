# 🍅 Pomodoro — 심플 뽀모도로 타이머

집중 시간과 휴식 시간을 설정하고 반복하는, 군더더기 없는 뽀모도로 타이머 웹 앱입니다.
웹에서 바로 사용할 수 있고, PWA로 설치하면 독립된 창으로도 사용할 수 있습니다.

**🔗 배포 링크:** _https://focustime-m.netlify.app_

---

## ✨ 주요 기능

- **타이머 설정** — 집중/휴식 시간을 +/- 버튼 또는 숫자 직접 입력으로 조절 (상한 없음)
- **반복 설정** — 원하는 횟수만큼 반복하거나, 끌 때까지 무한 반복
  - 10회 이하는 진행 상황을 점(●)으로, 11회 이상은 `(3/15)` 형태 텍스트로 표시
- **알림 소리** — 집중 ↔ 휴식 전환 시 알림음 재생, 타이머 화면에서 아이콘 하나로 켜고 끄기
- **5가지 테마** — Sunset / Ocean / Forest / Blossom / Mono 중 선택, 즉시 전체 UI에 반영
- **설정 저장** — 마지막으로 사용한 설정값이 localStorage에 저장되어 다음 방문 시에도 유지
- **PWA 설치** — 지원 브라우저에서 데스크톱/모바일 앱처럼 설치해 독립 창으로 실행 가능 (설치 가능 상태일 때만 설치 버튼 노출)

---

## 🛠 기술 스택

- **React + TypeScript**
- **Vite** — 빌드 도구
- 상태 관리는 별도 라이브러리 없이 `useState` / `useEffect`만으로 구현
- Web Audio API로 알림음 재생 (별도 사운드 파일 불필요)
- PWA — `manifest.json` + Service Worker (`vite-plugin-pwa`)

---

## 📂 프로젝트 구조

```
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon-maskable-512.png
├── src/
│   ├── App.tsx              # 메인 컴포넌트 (설정 / 타이머 / 완료 화면)
│   ├── App.css               # 전체 스타일 (테마 색상은 CSS 변수로 관리)
│   ├── useInstallPrompt.ts   # PWA 설치 가능 여부 / 설치 상태 감지 훅
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

---

## 📱 PWA로 설치하기

- **Chrome / Edge (Windows, macOS, Android)**: 사이트 접속 시 뜨는 설치 배너 또는 주소창의 설치 아이콘 클릭
- **iOS Safari**: 공유 버튼 → "홈 화면에 추가"
- 설치 후에는 브라우저 주소창 없이 독립된 창으로 실행되며, 마지막 창 크기/위치가 기억됩니다.

---

## 🎨 테마

| 테마          | 집중 색상 | 휴식 색상 |
| ------------- | --------- | --------- |
| Sunset (기본) | `#E8604C` | `#4C9E8E` |
| Ocean         | `#2E6F95` | `#7FC8A9` |
| Forest        | `#4C6B4F` | `#A9BE6E` |
| Blossom       | `#D46A9F` | `#F2B3B3` |
| Mono          | `#2B2B2B` | `#6E6E6E` |

---

## 📄 라이선스

개인 프로젝트입니다.
