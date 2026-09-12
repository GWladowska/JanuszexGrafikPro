<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Biznes i godziny otwarcia (S-01)

- **Plan**: context/changes/business-opening-hours/plan.md
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: REVISE → **SOUND** (po triage — wszystkie ustalenia naprawione)
- **Findings**: 2 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL → PASS (F1 naprawione) |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → PASS (F3 naprawione) |
| Blind Spots | WARNING → PASS (F4 naprawione) |
| Plan Completeness | FAIL → PASS (F2, F5 naprawione) |

## Grounding

10/10 istniejących paths ✓ (4 nowe — rodzice istnieją), 10/10 symbols ✓, brief↔plan ✓.
Weryfikacja deep: seed.sql (owner@example.com/haslo12345, pon–sob, nd brak), database.types.ts:129/:188, SubmitButton useFormStatus, signin redirect `/`, brak fetch+JSON precedentu, middleware startsWith — potwierdzone sub-agentem.

## Findings

### F1 — Po logowaniu ląduje na `/`, nie na `/business/setup`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — realny kompromis; warto przemyśleć
- **Dimension**: End-State Alignment
- **Location**: Desired End State + Faza 3 (kryterium 3.4)
- **Detail**: `signin.ts:19` redirectuje na `/` (publiczny Welcome); żaden phase tego nie zmienia — obietnica „po logowaniu ląduje na /business/setup" i kryterium 3.4 nie przejdą bez ręcznego kliku „Dashboard".
- **Fix ⭐ Recommended**: Redirect w `src/pages/api/auth/signin.ts` z `/` na `/dashboard` + dopisanie pliku do Fazy 3 (zmiana 7). Gating dashboardu domyka przepływ dla obu stanów konta.
  - Strength: jeden mechanizm gatingu, działa dla świeżych i istniejących kont.
  - Tradeoff: dotyka pliku auth (1 linia).
  - Confidence: HIGH.
  - Blind spot: brak istotnych.
- **Decision**: FIXED (Fix ⭐)

### F2 — Progress: 4. punkt Manual Verification bez checkboxa

- **Severity**: ❌ CRITICAL (mechaniczny kontrakt)
- **Impact**: 🏃 LOW — poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 3 — Manual Verification (4 punkty) vs `## Progress` (3.4–3.6)
- **Detail**: Ostatni punkt (gating niezalogowanych na /business i /business/setup) bez pozycji; 3.6 scala walidacje z częściowym gatingiem.
- **Fix**: Dodać `- [ ] 3.7` i odchudzić 3.6 do samych walidacji.
- **Decision**: FIXED

### F3 — SubmitButton z useFormStatus nie zadziała w fetch+JSON

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — poprawka oczywista i wąska
- **Dimension**: Architectural Fitness
- **Location**: Faza 3, zmiana 5 — Contract
- **Detail**: `SubmitButton.tsx:12` czyta `useFormStatus()`, które raportuje pending tylko dla natywnego submitu `<form>` — w fetch+JSON nigdy nie przejdzie w pending.
- **Fix**: Opcjonalny prop `pending?: boolean` (fallback do useFormStatus), islandy przekazują własny stan.
- **Decision**: FIXED

### F4 — Krok manualny 2: błędna arytmetyka i no-op

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Testing Strategy — Manual Testing Steps, krok 2
- **Detail**: Prefill pon–pt (5 dni), więc „6 wierszy pon–pt" błędne; „sobotę zamknij" no-op (już zamknięta w prefillu).
- **Fix**: Krok 2 przerobiony: „sobotę otwórz i ustaw godziny" → 6 wierszy pon–sob + brak nd (pokrywa insert nowego dnia).
- **Decision**: FIXED

### F5 — Mikroluki w kontraktach API/serwisu

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Faza 2 — Contracts; Faza 3.3
- **Detail**: (a) ścieżka 404 dla PUT-ów nieopisana; (b) normalizacja `HH:MM:SS`→`HH:MM` z PostgREST nieprzypisana; (c) „500 jak w auth routes" mylące (auth robi redirect).
- **Fix**: Zdanie w Overview Fazy 2 + sprostowanie kontraktu null-client.
- **Decision**: FIXED

### F6 — „Upsert istniejących + insert nowych" to jeden call

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Lean Execution
- **Location**: Critical Implementation Details vs Performance Considerations
- **Detail**: Jeden `.upsert(openDays, { onConflict: "business_id,weekday" })` obsługuje i istniejące, i nowe wiersze; plan wewnętrznie niespójny (3 operacje vs „1–3 round-tripy").
- **Fix**: Przeformułowane: jeden upsert dni otwartych + delete zamkniętych.
- **Decision**: FIXED
