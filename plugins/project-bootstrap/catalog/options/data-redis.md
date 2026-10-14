---
id: cache.redis
kind: cache
title_en: Redis cache
title_ko: Redis 캐시
summary_en: An in-memory cache or ephemeral coordination store.
summary_ko: 인메모리 캐시 또는 임시 조정 저장소입니다.
tags: [cache, performance]
requires_any: [data.postgresql, service.nestjs, service.fastapi, service.go-http, service.spring-boot, service.aspnet-core]
---

Define eviction, invalidation, durability, and sensitive-data policy before use.
