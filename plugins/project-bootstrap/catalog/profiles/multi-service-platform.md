---
id: profile.multi-service-platform
kind: profile
title_en: Multi-service platform
title_ko: 다중 서비스 플랫폼
summary_en: A platform with explicit service ownership, asynchronous boundaries, observability, and delivery coordination.
summary_ko: 명시적인 서비스 소유권, 비동기 경계, 관측성 및 배포 조정을 갖춘 플랫폼입니다.
tags: [platform, high-scale, high-control]
stages: [production]
languages: [typescript, python, java, kotlin, go, dotnet]
base_score: 55
suggests: [architecture.microservices, repository.monorepo, language.typescript, service.nestjs, data.postgresql, observability.opentelemetry]
---

Use this profile only when independent deployability and ownership are justified. Start with an explicit boundary map rather than creating services by default.
