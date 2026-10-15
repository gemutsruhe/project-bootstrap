---
id: profile.mobile-app
kind: profile
title_en: Mobile application
title_ko: 모바일 애플리케이션
summary_en: A mobile client with a backend contract, release workflow, and mobile-specific quality gates.
summary_ko: 백엔드 계약, 릴리스 흐름 및 모바일 품질 게이트를 포함한 모바일 클라이언트입니다.
tags: [mobile, client, small-team]
stages: [mvp, production]
languages: [typescript, flutter]
base_score: 56
suggests: [architecture.modular-monolith, language.flutter, mobile.flutter, service.fastapi, data.postgresql, delivery.github-actions, security.oidc, testing.contract, observability.opentelemetry]
---

Use this profile when the primary user interface runs on iOS or Android. Choose one mobile runtime and explicitly record the backend ownership boundary.
