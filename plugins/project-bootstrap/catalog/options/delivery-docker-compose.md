---
id: delivery.docker-compose
kind: delivery
title_en: Docker Compose local environment
title_ko: Docker Compose 로컬 환경
summary_en: A containerized local development composition with explicit environment variables.
summary_ko: 명시적인 환경 변수를 갖는 컨테이너화된 로컬 개발 구성입니다.
tags: [container, local-development, cloud-neutral]
---

Keep production deployment topology separate from the local composition unless explicitly approved.
An active local composition requires a root Dockerfile, an environment example, and a reviewed application port. PostgreSQL or other backing services need their own configuration decision; until then the artifact is deferred rather than rendered as a runnable placeholder.
