---
id: profile.data-ai
kind: profile
title_en: Data and AI workload
title_ko: 데이터 및 AI 워크로드
summary_en: A governed data pipeline or AI service with reproducible environments, evaluation, and monitoring.
summary_ko: 재현 가능한 환경, 평가 및 모니터링을 포함한 거버넌스형 데이터 파이프라인 또는 AI 서비스입니다.
tags: [data, ai, regulated]
stages: [mvp, production]
languages: [python]
base_score: 62
suggests: [architecture.event-driven, language.python, data.python-workload, data.postgresql, messaging.nats, delivery.docker-compose, delivery.github-actions, security.oidc, testing.contract, observability.opentelemetry, ai.rag]
---

Use this profile for batch, pipeline, retrieval, or model-serving work. Record data classification and evaluation criteria before enabling production execution.
