---
id: android.ui.mvvm
kind: ui-architecture
title_en: Android MVVM
title_ko: Android MVVM
summary_en: Screen-level ViewModels expose UI state to the Android UI and receive user actions.
summary_ko: 화면별 ViewModel이 UI 상태를 노출하고 사용자 동작을 받는 방식입니다.
tags: [android, mobile, ui-architecture]
requires: [mobile.android-native]
conflicts: [android.ui.mvi]
---

Use this as the common Android starting pattern. State can flow unidirectionally without a separate MVI library. Decide the state-management implementation independently.
