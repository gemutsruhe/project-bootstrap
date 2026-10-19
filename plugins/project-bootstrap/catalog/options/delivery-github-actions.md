---
id: delivery.github-actions
kind: delivery
title_en: GitHub Actions CI
title_ko: GitHub Actions CI
summary_en: A CI workflow for validation, tests, and artifact checks.
summary_ko: 검증, 테스트 및 아티팩트 확인을 위한 CI 워크플로입니다.
tags: [ci, delivery]
---

Generated workflow drafts must not contain deployment secrets or automatic production deployment.
An active workflow requires a root npm manifest and lockfile, declared test and build scripts, and a reviewed Node.js version. Otherwise planning is deferred and no workflow file is written. A bootstrap-record-only check is not a substitute for application verification.
