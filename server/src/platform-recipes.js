import { targetFile } from "./platform-selection.js";

const json = (value) => JSON.stringify(value, null, 2) + "\n";
const artifact = (target, file, content) => ({ path: targetFile(target, file), content, template: "platform-recipe", operation: "create", approvalRequired: true });
const command = (target, value, purpose, networkEffect = "none") => ({ command: value, workingDirectory: target.path, purpose, networkEffect, approvalRequired: true });
const has = (target, id) => Object.values(target.choices).flat().includes(id);
const record = (target) => artifact(target, "docs/architecture/platform-decisions.md", [
  `# ${target.platformId} platform decisions`, "", "These are reviewed bootstrap choices, not product features.", "",
  ...Object.entries(target.choices).map(([slot, id]) => `- ${slot}: ${Array.isArray(id) ? id.join(", ") : id}`), ""
].join("\n"));

function reactDependencies(target) {
  const result = {};
  if (["web.zustand", "expo.zustand", "desktop.zustand"].some((id) => has(target, id))) result.zustand = "^5.0.0";
  if (["web.redux", "expo.redux", "desktop.redux"].some((id) => has(target, id))) {
    result["@reduxjs/toolkit"] = "^2.0.0";
    result["react-redux"] = "^9.0.0";
  }
  if (has(target, "web.tanstack-query")) result["@tanstack/react-query"] = "^5.0.0";
  return result;
}

function reactStateArtifact(target) {
  if (["web.zustand", "expo.zustand", "desktop.zustand"].some((id) => has(target, id))) return artifact(target, "src/state/app-state.ts", "import { create } from 'zustand';\n\ntype AppState = { ready: boolean; setReady: (ready: boolean) => void };\nexport const useAppState = create<AppState>((set) => ({ ready: false, setReady: (ready) => set({ ready }) }));\n");
  if (["web.redux", "expo.redux", "desktop.redux"].some((id) => has(target, id))) return artifact(target, "src/state/store.ts", "import { configureStore, createSlice } from '@reduxjs/toolkit';\n\nconst app = createSlice({ name: 'app', initialState: { ready: false }, reducers: { ready: (state) => { state.ready = true; } } });\nexport const { ready } = app.actions;\nexport const store = configureStore({ reducer: { app: app.reducer } });\nexport type RootState = ReturnType<typeof store.getState>;\n");
  return artifact(target, "src/state/app-state.ts", "// Keep local UI state in React until a shared store is needed.\nexport type AppState = { ready: boolean };\n");
}

function reactProviders(target) {
  const redux = ["web.redux", "expo.redux", "desktop.redux"].some((id) => has(target, id));
  const query = has(target, "web.tanstack-query");
  const imports = ["'use client';", "import type { ReactNode } from 'react';"];
  if (redux) imports.push("import { Provider as ReduxProvider } from 'react-redux';", "import { store } from './state/store';");
  if (query) imports.push("import { QueryClientProvider } from '@tanstack/react-query';", "import { queryClient } from './state/query-client';");
  let tree = "<>{children}</>";
  if (redux) tree = `<ReduxProvider store={store}>${tree}</ReduxProvider>`;
  if (query) tree = `<QueryClientProvider client={queryClient}>${tree}</QueryClientProvider>`;
  return `\n${imports.join("\n")}\nexport default function Providers({ children }: { children: ReactNode }) { return ${tree}; }\n`;
}

function webRecipe(target) {
  const next = has(target, "web.nextjs");
  const deps = { react: "^19.0.0", "react-dom": "^19.0.0", ...reactDependencies(target) };
  const dev = { typescript: "^5.0.0", vite: "^8.0.0", vitest: "^5.0.0", "@playwright/test": "^1.0.0", "@types/node": "^24.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" };
  const files = [record(target), reactStateArtifact(target), artifact(target, "src/providers.tsx", reactProviders(target))];
  if (target.choices.database) {
    if (next) {
      deps["@prisma/client"] = "^6.0.0";
      dev.prisma = "^6.0.0";
      const provider = target.choices.database === "data.postgresql" ? "postgresql" : target.choices.database === "data.mysql" ? "mysql" : "sqlite";
      files.push(artifact(target, "prisma/schema.prisma", `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${provider}"\n  url = env("DATABASE_URL")\n}\n\nmodel BootstrapRecord {\n  id Int @id @default(autoincrement())\n  value String\n}\n`));
      files.push(artifact(target, ".env.example", `DATABASE_URL=${provider === "sqlite" ? '"file:./dev.db"' : '""'}\n`));
      files.push(artifact(target, "src/data/db.ts", "import { PrismaClient } from '@prisma/client';\nexport const db = new PrismaClient();\n"));
    }
  }
  if (next) {
    deps.next = "^16.0.0";
    files.push(artifact(target, "package.json", json({ private: true, scripts: { dev: "next dev", build: "next build", test: "vitest run", "test:e2e": "playwright test" }, dependencies: deps, devDependencies: dev })));
    files.push(artifact(target, "tsconfig.json", json({ compilerOptions: { target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] } }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"], exclude: ["node_modules"] })));
    files.push(artifact(target, "next-env.d.ts", "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n"));
    files.push(artifact(target, "src/app/layout.tsx", "import type { ReactNode } from 'react';\nimport Providers from '../providers';\nexport default function RootLayout({ children }: { children: ReactNode }) { return <html lang=\"en\"><body><Providers>{children}</Providers></body></html>; }\n"));
    files.push(artifact(target, "src/app/page.tsx", "export default function Home() { return <main><h1>Project ready</h1></main>; }\n"));
  } else {
    files.push(artifact(target, "package.json", json({ private: true, type: "module", scripts: { dev: "vite", build: "tsc --noEmit && vite build", test: "vitest run", "test:e2e": "playwright test" }, dependencies: deps, devDependencies: { ...dev, "@vitejs/plugin-react": "^6.0.0" } })));
    files.push(artifact(target, "tsconfig.json", json({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true }, include: ["src", "vite.config.ts"] })));
    files.push(artifact(target, "vite.config.ts", "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n"));
    files.push(artifact(target, "index.html", "<!doctype html><html><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" /></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>\n"));
    files.push(artifact(target, "src/main.tsx", "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport Providers from './providers';\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><Providers><App /></Providers></React.StrictMode>);\n"));
    files.push(artifact(target, "src/App.tsx", "export default function App() { return <main><h1>Project ready</h1></main>; }\n"));
  }
  if (has(target, "web.tanstack-query")) files.push(artifact(target, "src/state/query-client.ts", "import { QueryClient } from '@tanstack/react-query';\nexport const queryClient = new QueryClient();\n"));
  files.push(artifact(target, "tests/smoke.test.ts", "import { expect, test } from 'vitest';\ntest('project baseline', () => expect(true).toBe(true));\n"));
  files.push(artifact(target, "playwright.config.ts", "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './tests/e2e' });\n"));
  return { artifacts: files, commands: [command(target, "npm install", "Install the reviewed package manifest.", "downloads dependencies"), ...(next && target.choices.database ? [command(target, "npx prisma generate", "Generate the reviewed Prisma database client after dependency installation.", "may download Prisma engines")] : [])], checks: ["npm run build", "npm test"] };
}

function apiRecipe(target) {
  const framework = target.choices.framework;
  const files = [record(target)];
  let install = [];
  let checks = [];
  if (framework === "api.fastapi") {
    const deps = ["fastapi>=0.115,<1", "uvicorn>=0.30,<1"];
    if (target.choices.database) deps.push("sqlalchemy>=2,<3", ...(target.choices.database === "data.postgresql" ? ["psycopg[binary]>=3,<4"] : target.choices.database === "data.mysql" ? ["pymysql>=1,<2"] : []));
    files.push(artifact(target, "pyproject.toml", `[project]\nname = "bootstrap-api"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = [${deps.map((item) => JSON.stringify(item)).join(", ")}]\n\n[project.optional-dependencies]\ntest = ["pytest>=8,<9", "httpx>=0.27,<1"]\n\n[build-system]\nrequires = ["setuptools>=75"]\nbuild-backend = "setuptools.build_meta"\n\n[tool.setuptools.packages.find]\nwhere = ["src"]\n`));
    files.push(artifact(target, "src/bootstrap_api/__init__.py", ""));
    files.push(artifact(target, "src/bootstrap_api/main.py", "from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get('/health')\ndef health() -> dict[str, str]:\n    return {'status': 'ok'}\n"));
    if (target.choices.database) files.push(artifact(target, "src/bootstrap_api/database.py", "import os\nfrom sqlalchemy import create_engine\n\ndef engine():\n    url = os.environ['DATABASE_URL']\n    return create_engine(url, pool_pre_ping=True)\n"));
    files.push(artifact(target, "tests/test_health.py", "from fastapi.testclient import TestClient\nfrom bootstrap_api.main import app\n\ndef test_health() -> None:\n    assert TestClient(app).get('/health').json() == {'status': 'ok'}\n"));
    install = [command(target, "python -m pip install -e '.[test]'", "Install the Python API and test dependencies.", "downloads dependencies")];
    checks = ["python -m pytest"];
  } else if (framework === "api.nestjs") {
    const deps = { "@nestjs/common": "^11.0.0", "@nestjs/core": "^11.0.0", "@nestjs/platform-express": "^11.0.0", "reflect-metadata": "^0.2.0", rxjs: "^7.8.0" };
    if (target.choices.database) Object.assign(deps, { "@prisma/client": "^6.0.0" });
    files.push(artifact(target, "package.json", json({ private: true, scripts: { dev: "nest start --watch", build: "nest build", test: "jest" }, dependencies: deps, devDependencies: { "@nestjs/cli": "^11.0.0", "@nestjs/testing": "^11.0.0", typescript: "^5.0.0", jest: "^29.0.0", "ts-jest": "^29.0.0", "@types/jest": "^29.0.0", ...(target.choices.database ? { prisma: "^6.0.0" } : {}) }, jest: { preset: "ts-jest", testEnvironment: "node", roots: ["<rootDir>/test"] } })));
    files.push(artifact(target, "tsconfig.json", json({ compilerOptions: { module: "commonjs", target: "ES2022", experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, esModuleInterop: true, outDir: "dist", sourceMap: true }, include: ["src/**/*.ts", "test/**/*.ts"] })));
    files.push(artifact(target, "nest-cli.json", json({ collection: "@nestjs/schematics", sourceRoot: "src" })));
    files.push(artifact(target, "src/main.ts", "import 'reflect-metadata';\nimport { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nasync function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(process.env.PORT || 3000); }\nvoid bootstrap();\n"));
    files.push(artifact(target, "src/app.module.ts", `import { Module } from '@nestjs/common';\nimport { HealthController } from './health.controller';\n${target.choices.database ? "import { PrismaService } from './database/prisma.service';\n" : ""}@Module({ controllers: [HealthController]${target.choices.database ? ", providers: [PrismaService]" : ""} }) export class AppModule {}\n`));
    files.push(artifact(target, "src/health.controller.ts", "import { Controller, Get } from '@nestjs/common';\n@Controller('health') export class HealthController { @Get() health() { return { status: 'ok' }; } }\n"));
    files.push(artifact(target, "test/health.spec.ts", "import { HealthController } from '../src/health.controller';\ntest('health', () => expect(new HealthController().health()).toEqual({ status: 'ok' }));\n"));
    if (target.choices.database) {
      const provider = target.choices.database === "data.postgresql" ? "postgresql" : target.choices.database === "data.mysql" ? "mysql" : "sqlite";
      files.push(artifact(target, "prisma/schema.prisma", `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${provider}"\n  url = env("DATABASE_URL")\n}\n\nmodel BootstrapRecord {\n  id Int @id @default(autoincrement())\n  value String\n}\n`));
      files.push(artifact(target, "src/database/prisma.service.ts", "import { Injectable } from '@nestjs/common';\nimport { PrismaClient } from '@prisma/client';\n@Injectable() export class PrismaService extends PrismaClient {}\n"));
    }
    install = [command(target, "npm install", "Install the reviewed NestJS dependencies.", "downloads dependencies"), ...(target.choices.database ? [command(target, "npx prisma generate", "Generate the selected database client before building.", "may download Prisma engines")] : [])];
    checks = ["npm run build", "npm test"];
  } else if (framework === "api.go") {
    const goDriver = target.choices.database === "data.postgresql" ? ["github.com/jackc/pgx/v5/stdlib", "github.com/jackc/pgx/v5", "v5.7.0"]
      : target.choices.database === "data.mysql" ? ["github.com/go-sql-driver/mysql", "github.com/go-sql-driver/mysql", "v1.8.1"]
        : ["modernc.org/sqlite", "modernc.org/sqlite", "v1.33.1"];
    files.push(artifact(target, "go.mod", `module example.com/bootstrap-api\n\ngo 1.27\n${target.choices.database ? `\nrequire ${goDriver[1]} ${goDriver[2]}\n` : ""}`));
    files.push(artifact(target, "main.go", "package main\n\nimport (\n  \"encoding/json\"\n  \"log\"\n  \"net/http\"\n)\n\nfunc handler(w http.ResponseWriter, r *http.Request) {\n  w.Header().Set(\"Content-Type\", \"application/json\")\n  _ = json.NewEncoder(w).Encode(map[string]string{\"status\": \"ok\"})\n}\nfunc main() { http.HandleFunc(\"/health\", handler); log.Fatal(http.ListenAndServe(\":8080\", nil)) }\n"));
    files.push(artifact(target, "main_test.go", "package main\n\nimport (\n  \"net/http\"\n  \"net/http/httptest\"\n  \"testing\"\n)\nfunc TestHealth(t *testing.T) { w := httptest.NewRecorder(); handler(w, httptest.NewRequest(http.MethodGet, \"/health\", nil)); if w.Code != http.StatusOK { t.Fatal(w.Code) } }\n"));
    if (target.choices.database) files.push(artifact(target, "database.go", `package main\nimport (\n  "database/sql"\n  "os"\n  _ "${goDriver[0]}"\n)\nfunc openDatabase() (*sql.DB, error) { return sql.Open("${target.choices.database === "data.postgresql" ? "pgx" : target.choices.database === "data.mysql" ? "mysql" : "sqlite"}", os.Getenv("DATABASE_URL")) }\n`));
    install = target.choices.database ? [command(target, "go mod tidy", "Resolve the reviewed SQL driver and write go.sum.", "downloads Go modules")] : [];
    checks = ["go test ./...", "go build ./..."];
  } else if (framework === "api.aspnet") {
    const provider = target.choices.database === "data.postgresql" ? ["Npgsql", "10.0.3", "Npgsql.NpgsqlConnection"] : target.choices.database === "data.mysql" ? ["MySqlConnector", "2.6.2", "MySqlConnector.MySqlConnection"] : ["Microsoft.Data.Sqlite", "10.0.13", "Microsoft.Data.Sqlite.SqliteConnection"];
    files.push(artifact(target, "BootstrapApi.csproj", `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><Compile Remove="tests/**/*.cs" />${target.choices.database ? `<PackageReference Include="${provider[0]}" Version="${provider[1]}" />` : ""}</ItemGroup></Project>\n`));
    files.push(artifact(target, "Program.cs", "var builder = WebApplication.CreateBuilder(args);\nvar app = builder.Build();\napp.MapGet(\"/health\", () => Results.Ok(new { status = \"ok\" }));\napp.Run();\n"));
    if (target.choices.database) files.push(artifact(target, "Data/DatabaseConnection.cs", `using System.Data.Common;\nnamespace BootstrapApi.Data;\npublic static class DatabaseConnection { public static DbConnection Open() { var value = Environment.GetEnvironmentVariable("DATABASE_URL") ?? throw new InvalidOperationException("DATABASE_URL is required"); var connection = new ${provider[2]}(value); connection.Open(); return connection; } }\n`));
    files.push(artifact(target, "tests/BootstrapApi.Tests.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework><IsTestProject>true</IsTestProject><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><PackageReference Include=\"Microsoft.NET.Test.Sdk\" Version=\"17.11.1\" /><PackageReference Include=\"xunit\" Version=\"2.9.2\" /><PackageReference Include=\"xunit.runner.visualstudio\" Version=\"2.8.2\" /><ProjectReference Include=\"../BootstrapApi.csproj\" /></ItemGroup></Project>\n"));
    files.push(artifact(target, "tests/BaselineTests.cs", "using Xunit;\npublic class BaselineTests { [Fact] public void Baseline() { Assert.True(true); } }\n"));
    install = [command(target, "dotnet restore BootstrapApi.csproj", "Restore reviewed .NET dependencies.", "downloads NuGet packages")];
    checks = ["dotnet build BootstrapApi.csproj", "dotnet test tests/BootstrapApi.Tests.csproj"];
  } else if (framework === "api.spring") {
    files.push(artifact(target, "settings.gradle", "rootProject.name = 'bootstrap-api'\n"));
    const springDriver = target.choices.database === "data.postgresql" ? "org.postgresql:postgresql" : target.choices.database === "data.mysql" ? "com.mysql:mysql-connector-j" : "org.xerial:sqlite-jdbc";
    files.push(artifact(target, "build.gradle", `plugins { id 'java'; id 'org.springframework.boot' version '3.5.16'; id 'io.spring.dependency-management' version '1.1.6' }\ngroup = 'example'; version = '0.1.0'\njava { toolchain { languageVersion = JavaLanguageVersion.of(17) } }\nrepositories { mavenCentral() }\ndependencies { implementation 'org.springframework.boot:spring-boot-starter-web'; testImplementation 'org.springframework.boot:spring-boot-starter-test'${target.choices.database ? `; implementation 'org.springframework.boot:spring-boot-starter-data-jpa'; runtimeOnly '${springDriver}'` : ""} }\ntasks.named('test') { useJUnitPlatform() }\n`));
    files.push(artifact(target, "src/main/java/example/Application.java", "package example;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RestController;\n@SpringBootApplication @RestController public class Application {\n  public static void main(String[] args) { SpringApplication.run(Application.class, args); }\n  @GetMapping(\"/health\") public java.util.Map<String,String> health() { return java.util.Map.of(\"status\", \"ok\"); }\n}\n"));
    files.push(artifact(target, "src/test/java/example/BaselineTest.java", "package example;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertTrue;\nclass BaselineTest { @Test void baseline() { assertTrue(true); } }\n"));
    if (target.choices.database) files.push(artifact(target, "src/main/resources/application.properties", "spring.datasource.url=${DATABASE_URL}\n"));
    checks = ["gradle test", "gradle build"];
  } else if (framework === "api.ktor") {
    files.push(artifact(target, "settings.gradle.kts", "rootProject.name = \"bootstrap-api\"\n"));
    const ktorDriver = target.choices.database === "data.postgresql" ? "org.postgresql:postgresql:42.7.4" : target.choices.database === "data.mysql" ? "com.mysql:mysql-connector-j:9.1.0" : "org.xerial:sqlite-jdbc:3.46.1.3";
    files.push(artifact(target, "build.gradle.kts", `plugins { kotlin("jvm") version "2.4.0"; application }\nrepositories { mavenCentral() }\ndependencies { implementation("io.ktor:ktor-server-core-jvm:3.6.0"); implementation("io.ktor:ktor-server-netty-jvm:3.6.0"); testImplementation(kotlin("test-junit5")); testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.11.3")${target.choices.database ? `; implementation("${ktorDriver}")` : ""} }\napplication { mainClass.set("example.ApplicationKt") }\ntasks.test { useJUnitPlatform() }\n`));
    files.push(artifact(target, "src/main/kotlin/example/Application.kt", "package example\nimport io.ktor.server.engine.*\nimport io.ktor.server.netty.*\nimport io.ktor.server.application.*\nimport io.ktor.server.response.*\nimport io.ktor.server.routing.*\nfun main() { embeddedServer(Netty, port = 8080) { routing { get(\"/health\") { call.respondText(\"ok\") } } }.start(wait = true) }\n"));
    files.push(artifact(target, "src/test/kotlin/example/BaselineTest.kt", "package example\nimport kotlin.test.Test\nimport kotlin.test.assertTrue\nclass BaselineTest { @Test fun baseline() { assertTrue(true) } }\n"));
    if (target.choices.database) files.push(artifact(target, "src/main/kotlin/example/Database.kt", `package example\nimport java.sql.DriverManager\nfun openDatabase() = DriverManager.getConnection(System.getenv("DATABASE_URL"))\n`));
    checks = ["gradle test", "gradle build"];
  }
  if (target.choices.architecture === "api.hexagonal") {
    files.push(artifact(target, "docs/architecture/ports-and-adapters.md", "# Ports and adapters\n\nKeep domain contracts independent from HTTP and persistence adapters. Add each domain port when its first real use case is implemented.\n"));
    const ports = {
      "api.fastapi": ["src/bootstrap_api/domain/ports.py", "from typing import Protocol\n\nclass Clock(Protocol):\n    def now(self) -> float: ...\n"],
      "api.nestjs": ["src/domain/ports.ts", "export interface Clock { now(): number }\n"],
      "api.spring": ["src/main/java/example/domain/Clock.java", "package example.domain;\npublic interface Clock { long now(); }\n"],
      "api.ktor": ["src/main/kotlin/example/domain/Clock.kt", "package example.domain\ninterface Clock { fun now(): Long }\n"],
      "api.go": ["internal/domain/clock.go", "package domain\ntype Clock interface { Now() int64 }\n"],
      "api.aspnet": ["Domain/Clock.cs", "namespace BootstrapApi.Domain;\npublic interface IClock { long Now(); }\n"]
    };
    files.push(artifact(target, ...ports[framework]));
  }
  if (target.choices.database) files.push(artifact(target, ".env.example", `DATABASE_URL=\n# Selected database: ${target.choices.database}. Supply credentials outside source control.\n`));
  return { artifacts: files, commands: install, checks };
}

function dataRecipe(target) {
  const polars = has(target, "data.polars");
  const api = has(target, "data.api");
  const deps = [polars ? "polars>=1,<2" : "pandas>=2,<3", ...(api ? ["fastapi>=0.115,<1", "uvicorn>=0.30,<1"] : [])];
  return {
    artifacts: [record(target),
      artifact(target, "pyproject.toml", `[project]\nname = "bootstrap-data"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = [${deps.map((item) => JSON.stringify(item)).join(", ")}]\n\n[project.optional-dependencies]\ntest = ["pytest>=8,<9"]\n\n[build-system]\nrequires = ["setuptools>=75"]\nbuild-backend = "setuptools.build_meta"\n\n[tool.setuptools.packages.find]\nwhere = ["src"]\n`),
      artifact(target, "src/bootstrap_data/__init__.py", ""),
      artifact(target, api ? "src/bootstrap_data/api.py" : "src/bootstrap_data/pipeline.py", api
        ? "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/health')\ndef health() -> dict[str, str]: return {'status': 'ok'}\n"
        : `import ${polars ? "polars" : "pandas"} as frame\n\ndef transform(values: list[int]) -> int:\n    return sum(values)\n`),
      artifact(target, "tests/test_baseline.py", api ? "from bootstrap_data.api import health\ndef test_health(): assert health() == {'status': 'ok'}\n" : "from bootstrap_data.pipeline import transform\ndef test_transform(): assert transform([1, 2]) == 3\n")],
    commands: [command(target, "python -m pip install -e '.[test]'", "Install data package and test dependencies.", "downloads dependencies")],
    checks: ["python -m pytest"]
  };
}

function expoRecipe(target) {
  const deps = { expo: "~58.0.0", "expo-constants": "~58.0.12", "expo-linking": "~58.0.13", "expo-router": "~58.0.23", "expo-status-bar": "~58.0.3", react: "19.3.0", "react-dom": "19.3.0", "react-native": "0.88.0", "react-native-safe-area-context": "~5.10.1", "react-native-screens": "~4.30.0", "react-native-web": "~0.21.4", ...reactDependencies(target) };
  if (has(target, "expo.sqlite")) deps["expo-sqlite"] = "~58.0.13";
  const files = [record(target), reactStateArtifact(target), artifact(target, "src/providers.tsx", reactProviders(target)),
      artifact(target, "package.json", json({ private: true, main: "expo-router/entry", scripts: { start: "expo start", test: "jest --runInBand" }, dependencies: deps, devDependencies: { typescript: "~6.0.3", "jest-expo": "~58.0.0", jest: "^30.0.0", "@types/jest": "^30.0.0", "@types/react": "^19.0.0", "@testing-library/react-native": "^14.0.0" }, jest: { preset: "jest-expo" } })),
      artifact(target, "app.json", json({ expo: { name: target.id, slug: target.id, scheme: target.id, plugins: ["expo-router", "expo-status-bar"], experiments: { typedRoutes: true } } })),
      artifact(target, "tsconfig.json", json({ extends: "expo/tsconfig.base", compilerOptions: { strict: true } })),
      artifact(target, "app/_layout.tsx", "import { Stack } from 'expo-router';\nimport Providers from '../src/providers';\nexport default function Layout() { return <Providers><Stack /></Providers>; }\n"),
      artifact(target, "app/index.tsx", "import { Text, View } from 'react-native';\nexport default function Home() { return <View><Text>Project ready</Text></View>; }\n"),
      artifact(target, "tests/baseline.test.ts", "test('baseline', () => expect(true).toBe(true));\n")];
  if (has(target, "expo.sqlite")) files.push(artifact(target, "src/data/database.ts", "import * as SQLite from 'expo-sqlite';\nexport const openLocalDatabase = () => SQLite.openDatabaseAsync('app.db');\n"));
  return {
    artifacts: files,
    commands: [command(target, "npm install", "Install the reviewed Expo SDK 58 dependency manifest.", "downloads dependencies")],
    checks: ["npm test", "npx expo-doctor"]
  };
}

function flutterRecipe(target) {
  const extras = ["  go_router: ^14.0.0"];
  if (has(target, "flutter.riverpod")) extras.push("  flutter_riverpod: ^2.0.0");
  if (has(target, "flutter.bloc")) extras.push("  flutter_bloc: ^8.0.0");
  if (has(target, "flutter.sqflite")) extras.push("  sqflite: ^2.0.0");
  const name = target.id.replaceAll("-", "_");
  const stateFile = has(target, "flutter.bloc")
    ? "import 'package:flutter_bloc/flutter_bloc.dart';\nsealed class ReadyEvent {}\nfinal class MarkReady extends ReadyEvent {}\nclass ReadyBloc extends Bloc<ReadyEvent, bool> { ReadyBloc() : super(false) { on<MarkReady>((event, emit) => emit(true)); } }\n"
    : has(target, "flutter.riverpod")
      ? "import 'package:flutter_riverpod/flutter_riverpod.dart';\nfinal readyProvider = StateProvider<bool>((ref) => false);\n"
      : "import 'package:flutter/foundation.dart';\nclass ReadyModel extends ChangeNotifier { bool ready = false; void markReady() { ready = true; notifyListeners(); } }\n";
  return {
    artifacts: [record(target),
      artifact(target, "pubspec.yaml", `name: ${name}\ndescription: Reviewed Flutter project skeleton\npublish_to: none\nversion: 0.1.0+1\nenvironment:\n  sdk: '>=3.5.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n${extras.join("\n")}\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  flutter_lints: ^6.0.0\nflutter:\n  uses-material-design: true\n`),
      artifact(target, "lib/main.dart", "import 'package:flutter/material.dart';\nimport 'package:go_router/go_router.dart';\nvoid main() => runApp(const BootstrapApp());\nfinal router = GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Center(child: Text('Project ready'))))]);\nclass BootstrapApp extends StatelessWidget { const BootstrapApp({super.key}); @override Widget build(BuildContext context) => MaterialApp.router(routerConfig: router); }\n"),
      artifact(target, "lib/state/ready_state.dart", stateFile),
      ...(has(target, "flutter.sqflite") ? [artifact(target, "lib/data/local_database.dart", "import 'package:sqflite/sqflite.dart';\nFuture<Database> openLocalDatabase() => openDatabase('app.db');\n")] : []),
      artifact(target, "test/app_test.dart", "import 'package:flutter_test/flutter_test.dart';\nvoid main() { test('baseline', () => expect(1 + 1, 2)); }\n")],
    commands: [{ ...command(target, `flutter create --no-pub --project-name ${name} ${target.path}`, "Generate Flutter platform directories before applying the reviewed overlay."), workingDirectory: "." }, command(target, "flutter pub get", "Resolve reviewed Flutter dependencies.", "downloads dependencies")],
    checks: ["flutter analyze", "flutter test"]
  };
}

function androidRecipe(target) {
  const mvi = has(target, "android.mvi");
  const hilt = has(target, "android.hilt");
  const stateDependency = has(target, "android.orbit") ? "implementation(\"org.orbit-mvi:orbit-viewmodel:6.1.0\")" : has(target, "android.mavericks") ? "implementation(\"com.airbnb.android:mavericks:3.0.2\")" : "";
  const diDependency = hilt ? "implementation(\"com.google.dagger:hilt-android:2.52\"); kapt(\"com.google.dagger:hilt-compiler:2.52\")" : "implementation(\"io.insert-koin:koin-android:4.0.0\")";
  const room = has(target, "android.room") ? "implementation(\"androidx.room:room-runtime:2.6.1\"); kapt(\"androidx.room:room-compiler:2.6.1\")" : "";
  const kapt = hilt || has(target, "android.room");
  return {
    artifacts: [record(target),
      artifact(target, "settings.gradle.kts", "pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = \"BootstrapAndroid\"\ninclude(\":app\")\n"),
      artifact(target, "gradle.properties", "android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n"),
      artifact(target, "build.gradle.kts", `plugins { id("com.android.application") version "8.7.3" apply false; id("org.jetbrains.kotlin.android") version "2.0.21" apply false; id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false${kapt ? '; id("org.jetbrains.kotlin.kapt") version "2.0.21" apply false' : ""}${hilt ? '; id("com.google.dagger.hilt.android") version "2.52" apply false' : ""} }\n`),
      artifact(target, "app/build.gradle.kts", `plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose")${kapt ? '; id("org.jetbrains.kotlin.kapt")' : ""}${hilt ? '; id("com.google.dagger.hilt.android")' : ""} }\nandroid { namespace = "example.bootstrap"; compileSdk = 35; defaultConfig { applicationId = "example.bootstrap"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1" }; buildFeatures { compose = true }; compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 } }\ndependencies { implementation(platform("androidx.compose:compose-bom:2024.10.00")); implementation("androidx.activity:activity-compose:1.9.3"); implementation("androidx.compose.material3:material3"); implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7"); implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7"); ${stateDependency}; ${diDependency}; ${room}; testImplementation("junit:junit:4.13.2"); androidTestImplementation(platform("androidx.compose:compose-bom:2024.10.00")); androidTestImplementation("androidx.compose.ui:ui-test-junit4"); debugImplementation("androidx.compose.ui:ui-test-manifest") }\n`),
      artifact(target, "app/src/main/AndroidManifest.xml", "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\"><application android:name=\".BootstrapApplication\" android:theme=\"@android:style/Theme.Material.Light.NoActionBar\" android:label=\"Bootstrap\"><activity android:name=\".MainActivity\" android:exported=\"true\"><intent-filter><action android:name=\"android.intent.action.MAIN\"/><category android:name=\"android.intent.category.LAUNCHER\"/></intent-filter></activity></application></manifest>\n"),
      artifact(target, "app/src/main/java/example/bootstrap/BootstrapApplication.kt", hilt
        ? "package example.bootstrap\nimport android.app.Application\nimport dagger.hilt.android.HiltAndroidApp\n@HiltAndroidApp class BootstrapApplication : Application()\n"
        : "package example.bootstrap\nimport android.app.Application\nimport org.koin.android.ext.koin.androidContext\nimport org.koin.core.context.startKoin\nimport org.koin.dsl.module\nclass BootstrapApplication : Application() { override fun onCreate() { super.onCreate(); startKoin { androidContext(this@BootstrapApplication); modules(module { }) } } }\n"),
      artifact(target, "app/src/main/java/example/bootstrap/MainActivity.kt", `package example.bootstrap\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.material3.Text\n${hilt ? "import dagger.hilt.android.AndroidEntryPoint\n@AndroidEntryPoint " : ""}class MainActivity : ComponentActivity() { override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { Text("Project ready") } } }\n`),
      artifact(target, "app/src/main/java/example/bootstrap/ScreenViewModel.kt", has(target, "android.mavericks")
        ? "package example.bootstrap\nimport com.airbnb.mvrx.MavericksState\nimport com.airbnb.mvrx.MavericksViewModel\ndata class ScreenState(val ready: Boolean = false) : MavericksState\nclass ScreenViewModel(initialState: ScreenState) : MavericksViewModel<ScreenState>(initialState) { fun markReady() = setState { copy(ready = true) } }\n"
        : has(target, "android.orbit")
          ? "package example.bootstrap\nimport androidx.lifecycle.ViewModel\nimport org.orbitmvi.orbit.ContainerHost\nimport org.orbitmvi.orbit.viewmodel.container\nimport org.orbitmvi.orbit.syntax.simple.intent\nimport org.orbitmvi.orbit.syntax.simple.reduce\ndata class ScreenState(val ready: Boolean = false)\nclass ScreenViewModel : ViewModel(), ContainerHost<ScreenState, Nothing> { override val container = container<ScreenState, Nothing>(ScreenState()); fun markReady() = intent { reduce { state.copy(ready = true) } } }\n"
          : `package example.bootstrap\nimport androidx.lifecycle.ViewModel\nimport kotlinx.coroutines.flow.MutableStateFlow\nimport kotlinx.coroutines.flow.asStateFlow\ndata class ScreenState(val ready: Boolean = false)\nclass ScreenViewModel : ViewModel() { private val mutableState = MutableStateFlow(ScreenState()); val state = mutableState.asStateFlow(); ${mvi ? "fun onIntent(intent: ScreenIntent) { if (intent == ScreenIntent.MarkReady) mutableState.value = ScreenState(true) }" : "fun markReady() { mutableState.value = ScreenState(true) }"} }\n${mvi ? "sealed interface ScreenIntent { data object MarkReady : ScreenIntent }\n" : ""}`),
      ...(has(target, "android.room") ? [artifact(target, "app/src/main/java/example/bootstrap/BootstrapDatabase.kt", "package example.bootstrap\nimport androidx.room.Database\nimport androidx.room.Entity\nimport androidx.room.PrimaryKey\nimport androidx.room.RoomDatabase\n@Entity data class BootstrapRecord(@PrimaryKey val id: Long, val value: String)\n@Database(entities = [BootstrapRecord::class], version = 1) abstract class BootstrapDatabase : RoomDatabase()\n")] : []),
      artifact(target, "app/src/test/java/example/bootstrap/BaselineTest.kt", "package example.bootstrap\nimport org.junit.Assert.assertTrue\nimport org.junit.Test\nclass BaselineTest { @Test fun baseline() { assertTrue(true) } }\n")],
    commands: [command(target, "gradle test assembleDebug", "Build and test the reviewed Android project with an installed Android SDK.", "downloads Gradle dependencies")],
    checks: ["gradle test", "gradle assembleDebug"]
  };
}

function iosRecipe(target) {
  const tca = has(target, "ios.tca");
  const swiftData = has(target, "ios.swiftdata");
  const packages = tca ? "packages:\n  ComposableArchitecture:\n    url: https://github.com/pointfreeco/swift-composable-architecture\n    exactVersion: 1.26.2\n" : "";
  const dependencies = tca ? "    dependencies:\n      - package: ComposableArchitecture\n" : "";
  const files = [record(target),
      artifact(target, "project.yml", `name: BootstrapIOS\noptions:\n  bundleIdPrefix: example\n${packages}targets:\n  BootstrapIOS:\n    type: application\n    platform: iOS\n    deploymentTarget: "17.0"\n    sources: [Sources]\n${dependencies}    settings:\n      base:\n        SWIFT_VERSION: "5.9"\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: example.BootstrapIOS\n`),
      artifact(target, "Sources/BootstrapApp.swift", `import SwiftUI\n${swiftData ? "import SwiftData\n" : ""}${tca ? "import ComposableArchitecture\n" : ""}@main struct BootstrapApp: App { var body: some Scene { WindowGroup { ${tca ? "ContentView(store: Store(initialState: AppFeature.State()) { AppFeature() })" : "ContentView()"} }${swiftData ? ".modelContainer(for: BootstrapRecord.self)" : ""} } }\n`),
      artifact(target, "Sources/ContentView.swift", tca ? "import SwiftUI\nimport ComposableArchitecture\nstruct ContentView: View { let store: StoreOf<AppFeature>; var body: some View { WithViewStore(store, observe: \\.ready) { viewStore in Text(viewStore.state ? \"Project ready\" : \"Preparing\").onAppear { viewStore.send(.appeared) } } } }\n" : "import SwiftUI\nstruct ContentView: View { var body: some View { Text(\"Project ready\") } }\n"),
      ...(tca ? [] : [artifact(target, "Sources/AppModel.swift", "import Observation\n@Observable final class AppModel { var ready = false }\n")])];
  if (swiftData) files.push(artifact(target, "Sources/BootstrapRecord.swift", "import SwiftData\n@Model final class BootstrapRecord { var value: String; init(value: String) { self.value = value } }\n"));
  if (tca) files.push(artifact(target, "Sources/AppFeature.swift", "import ComposableArchitecture\nstruct AppFeature: Reducer { struct State: Equatable { var ready = false }; enum Action { case appeared }; var body: some ReducerOf<Self> { Reduce { state, action in switch action { case .appeared: state.ready = true; return .none } } } }\n"));
  return {
    artifacts: files,
    commands: [command(target, "xcodegen generate --spec project.yml", "On macOS, generate the Xcode project from the reviewed specification.", "may resolve Swift packages")],
    checks: ["xcodebuild -project BootstrapIOS.xcodeproj -scheme BootstrapIOS -sdk iphonesimulator build"]
  };
}

function desktopRecipe(target) {
  const tauri = has(target, "desktop.tauri");
  const deps = { react: "^19.0.0", "react-dom": "^19.0.0", ...reactDependencies(target) };
  const dev = { typescript: "^5.0.0", vite: "^8.0.0", vitest: "^5.0.0", "@vitejs/plugin-react": "^6.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" };
  if (tauri) dev["@tauri-apps/cli"] = "^2.0.0";
  else Object.assign(dev, { electron: "^33.0.0", "@electron-forge/cli": "^7.0.0", "@electron-forge/plugin-vite": "^7.0.0", "@electron-forge/maker-zip": "^7.0.0" });
  if (has(target, "desktop.sqlite")) {
    if (tauri) deps["@tauri-apps/plugin-sql"] = "^2.0.0";
    else deps["better-sqlite3"] = "^11.0.0";
  }
  const files = [record(target), reactStateArtifact(target), artifact(target, "src/providers.tsx", reactProviders(target)),
    artifact(target, "package.json", json({ name: "bootstrap-desktop", productName: "BootstrapDesktop", version: "0.1.0", author: "Project Bootstrap", private: true, ...(tauri ? { type: "module" } : { main: ".vite/build/main.js" }), scripts: { dev: tauri ? "tauri dev" : "electron-forge start", build: tauri ? "tauri build" : "electron-forge make", ...(tauri ? { predev: "tauri icon app-icon.svg", prebuild: "tauri icon app-icon.svg", "vite:dev": "vite --host 127.0.0.1", "vite:build": "vite build" } : {}), test: "vitest run" }, dependencies: deps, devDependencies: dev })),
    artifact(target, "index.html", "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>\n"),
    artifact(target, "src/main.tsx", "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport Providers from './providers';\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><Providers><main>Project ready</main></Providers></React.StrictMode>);\n"),
    artifact(target, tauri ? "vite.config.ts" : "vite.renderer.config.mjs", "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n")];
  if (tauri) {
    files.push(artifact(target, "app-icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#1f2937"/><path d="M128 136h256v240H128z" fill="#ffffff"/><path d="M160 168h192v176H160z" fill="#2563eb"/></svg>\n'));
    files.push(artifact(target, "src-tauri/Cargo.toml", `[package]\nname = "bootstrap-desktop"\nversion = "0.1.0"\nedition = "2021"\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n[dependencies]\ntauri = { version = "2", features = [] }\n${has(target, "desktop.sqlite") ? 'tauri-plugin-sql = { version = "2", features = ["sqlite"] }\n' : ""}`));
    files.push(artifact(target, "src-tauri/build.rs", "fn main() { tauri_build::build() }\n"));
    files.push(artifact(target, "src-tauri/src/main.rs", `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\nfn main() { tauri::Builder::default()${has(target, "desktop.sqlite") ? ".plugin(tauri_plugin_sql::Builder::default().build())" : ""}.run(tauri::generate_context!()).expect("failed to run app"); }\n`));
    files.push(artifact(target, "src-tauri/tauri.conf.json", json({ $schema: "https://schema.tauri.app/config/2", productName: "BootstrapDesktop", version: "0.1.0", identifier: "example.bootstrap.desktop", build: { frontendDist: "../dist", devUrl: "http://localhost:5173", beforeDevCommand: "npm run vite:dev", beforeBuildCommand: "npm run vite:build" }, app: { windows: [{ title: "BootstrapDesktop", width: 800, height: 600 }] }, bundle: { active: false } })));
    files.push(artifact(target, "src-tauri/capabilities/default.json", json({ identifier: "default", windows: ["main"], permissions: ["core:default", ...(has(target, "desktop.sqlite") ? ["sql:default"] : [])] })));
    if (has(target, "desktop.sqlite")) files.push(artifact(target, "src/data/database.ts", "import Database from '@tauri-apps/plugin-sql';\nexport const openLocalDatabase = () => Database.load('sqlite:app.db');\n"));
  } else {
    files.push(artifact(target, "forge.config.cjs", "module.exports = { makers: [{ name: '@electron-forge/maker-zip' }], plugins: [{ name: '@electron-forge/plugin-vite', config: { build: [{ entry: 'src/main.cjs', config: 'vite.main.config.mjs' }, { entry: 'src/preload.cjs', config: 'vite.preload.config.mjs' }], renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }] } }] };\n"));
    files.push(artifact(target, "vite.main.config.mjs", `import { defineConfig } from 'vite';\nexport default defineConfig({ build: { rollupOptions: { external: [${has(target, "desktop.sqlite") ? "'better-sqlite3'" : ""}] } } });\n`));
    files.push(artifact(target, "vite.preload.config.mjs", "import { defineConfig } from 'vite';\nexport default defineConfig({});\n"));
    files.push(artifact(target, "src/main.cjs", "const { app, BrowserWindow } = require('electron');\nconst path = require('node:path');\nfunction createWindow() { const win = new BrowserWindow({ webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') } }); if (MAIN_WINDOW_VITE_DEV_SERVER_URL) win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL); else win.loadFile(path.join(__dirname, '../renderer/main_window/index.html')); }\napp.whenReady().then(createWindow);\n"));
    files.push(artifact(target, "src/preload.cjs", "const { contextBridge } = require('electron');\ncontextBridge.exposeInMainWorld('bootstrap', { version: '0.1.0' });\n"));
    if (has(target, "desktop.sqlite")) files.push(artifact(target, "src/database.cjs", "const Database = require('better-sqlite3');\nmodule.exports.openLocalDatabase = () => new Database('app.db');\n"));
  }
  files.push(artifact(target, "tests/baseline.test.ts", "import { expect, test } from 'vitest';\ntest('baseline', () => expect(true).toBe(true));\n"));
  return { artifacts: files, commands: [command(target, "npm install", "Install reviewed desktop dependencies.", "downloads dependencies")], checks: ["npm test", "npm run build"] };
}

export function renderPlatformRecipe(target) {
  switch (target.platformId) {
    case "web": return webRecipe(target);
    case "api": return apiRecipe(target);
    case "android": return androidRecipe(target);
    case "expo": return expoRecipe(target);
    case "flutter": return flutterRecipe(target);
    case "ios": return iosRecipe(target);
    case "desktop": return desktopRecipe(target);
    case "data": return dataRecipe(target);
    default: throw new Error(`No recipe for platform: ${target.platformId}`);
  }
}
