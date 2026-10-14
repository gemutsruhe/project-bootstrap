---
id: profile.web-fullstack
kind: profile
title_en: Full-stack web application
title_ko: 풀스택 웹 애플리케이션
summary_en: A browser application, API, relational data store, and local container workflow.
summary_ko: 브라우저 앱, API, 관계형 데이터 저장소 및 로컬 컨테이너 흐름입니다.
tags: [web, fullstack, small-team, low-ops]
languages: [typescript]
base_score: 60
suggests: [architecture.modular-monolith, repository.monorepo, language.typescript, frontend.nextjs, service.nestjs, data.postgresql, delivery.docker-compose, delivery.github-actions, security.oidc, testing.contract, observability.opentelemetry]
---

Use this profile for product teams delivering one web experience and one API boundary. Start with a modular monolith unless independently deployable ownership is already clear.
