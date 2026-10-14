---
id: ai.rag
kind: ai
title_en: Retrieval-augmented generation
title_ko: 검색 증강 생성
summary_en: A retrieval layer that grounds generation in governed source material.
summary_ko: 거버넌스된 소스 자료에 생성을 기반시키는 검색 계층입니다.
tags: [ai, data]
requires: [data.python-workload]
warns_with: [security.oidc]
---

The OIDC warning is deliberate: identity alone does not establish document-level authorization. Record retrieval authorization separately.
