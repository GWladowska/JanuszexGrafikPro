# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Ekstrahuj zduplikowane helpery endpointów do src/lib/ zanim się rozjadą

**Context**: `context/changes/business-opening-hours` — endpointy `src/pages/api/business/index.ts` i `src/pages/api/business/opening-hours.ts`. Wzorzec: helpery HTTP (`readJsonBody`, `jsonResponse`) i stałe komunikatów błędów kopiowane między plikami endpointów.

**Problem**: Kopie zaczęły się rozjeżdżać — `ERROR_NOT_CONFIGURED` po angielsku, reszta po polsku; komunikaty trafiają wprost do UI, więc dryf widzi użytkownik. Każdy nowy endpoint zwiększa ryzyko kolejnych niespójności. AGENTS.md nakazuje wspólne helpery w `src/lib/`.

**Rule**: Nowy endpoint API korzysta z helperów ze `src/lib/http.ts`; nie kopiuje `readJsonBody`/`jsonResponse` ani stałych komunikatów błędów.

**Applies to**: implement, impl-review
