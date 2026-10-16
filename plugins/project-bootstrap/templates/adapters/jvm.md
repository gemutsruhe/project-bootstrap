# JVM adapter

Generate `build.gradle.kts` only after the user chooses Java or Kotlin, a supported JDK, and build policy. Preserve an existing Maven `pom.xml` or Groovy `build.gradle`; selecting a JVM runtime does not authorize a build-system migration. Do not infer dependency versions or execute Gradle.

Create `docs/architecture/interfaces/jvm.md` with HTTP, event, and persistence boundaries.
