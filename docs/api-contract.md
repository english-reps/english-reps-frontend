# English Reps HTTP contract v1

All routes start `/api/v1`. JSON uses snake_case. UUIDs are strings, timestamps UTC ISO 8601.
Errors: `{error:{code,message,details},request_id}` and `X-Request-ID` on every response.
400 bad input, 401 missing/expired session, 403 CSRF/origin, 404 missing item, 409 conflict,
422 validation, 429 auth limit, 503 database readiness. Private/auth responses use Cache-Control: no-store.
Mutations require exact configured Origin + X-CSRF-Token. Bootstrap csrf first; credentials include cookies.

| Method/path | Auth | Request -> result | Pages |
|---|---|---|---|
| GET /health/live | no | `{status:"ok"}` | health UI/Compose |
| GET /health/ready | no | database + schema + catalog check, `{status:"ready"}` | health UI/Compose |
| GET /auth/csrf | no | sets CSRF cookie; `{csrf_token}` | API client bootstrap |
| POST /auth/register | no | `{email,password}` -> `{user,csrf_token}` + session | register |
| POST /auth/login | no | `{email,password}` -> `{user,csrf_token}` + session | login |
| GET /auth/me | yes | `{id,email}` | shared account context |
| POST /auth/logout | yes | 204, revoke session and clear cookies | shared header |
| GET /catalog/vocabulary | no | `{entries: Vocabulary[]}` | practice/library |
| GET /catalog/listening | no | `{entries: Listening[]}` (optional `?part=1..4`) | listening |
| GET /catalog/reading | no | `{entries: Reading[]}` (optional `?part=5..7`) | reading |
| GET /progress | yes | `{records: Progress[]}` for current user only | bookmarks / progress |
| POST /progress/events | yes | StudyEvent -> `{correct,record}` | star bookmarks / review removal |
| GET /mock-exams | yes | `{exams: MockExam[]}` for current user only | mock-exam / progress |
| POST /mock-exams | yes | `{section:"listening"|"reading"}` -> `201 {exam}` (100 random official-format questions) | mock-exam |
| GET /mock-exams/{id} | yes | `{exam}` owned by current user | mock-exam |
| PATCH /mock-exams/{id} | yes | autosave `{answers,flagged_ids,played_keys,current_index,remaining_seconds}` -> `{exam}` | mock-exam |
| POST /mock-exams/{id}/submit | yes | final snapshot -> server-graded completed `{exam}` | mock-exam |
| DELETE /mock-exams/{id} | yes | `204`, deletes in-progress or completed mock exam | mock-exam / progress |

User: `{id:UUID,email:string}`. Password length 12..128, email normalized/case-insensitive.
Catalog preserves original shapes/IDs: vocabulary has id,word,senses[{pos,meaning}],example,
translation,page,unit. Listening (Parts 1–4) and Reading (Parts 5–7) have id,part,topic,prompt,
promptZh,options[{label,text,translation}],answer,explanation,keywords plus part-specific fields.

Progress: `{entry_id,category:"vocabulary"|"listening"|"reading",status:"mastered"|"review"|"unseen",
attempts:int,correct:int,updated_at}`. Cards affect status, quizzes/listening/reading also increment counters.
StudyEvent: `{event_id:UUID,entry_id,kind:"card"|"quiz"|"listening"|"reading",rating?:"mastered"|"review"|"unseen",
answer?:string}`. Card requires rating only, vocabulary quiz requires chosen vocabulary ID only,
listening requires A/B/C (Part 2) or A/B/C/D (Parts 1,3,4), reading requires A/B/C/D. Backend checks kind/item category and computes correctness.
Same event_id + same content returns unchanged grading plus current progress; changed content ->409.
