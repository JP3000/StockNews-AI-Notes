-- Demo users
INSERT INTO "User" ("id", "email")
VALUES
  ('demo-user-1', 'demo1@example.com'),
  ('demo-user-2', 'demo2@example.com')
ON CONFLICT ("id") DO UPDATE
SET
  "email" = EXCLUDED."email",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Demo notes (main notes shown in sidebar)
INSERT INTO "Note" ("id", "text", "authorId")
VALUES
  (
    'demo-note-1',
    'Title: NVDA earnings snapshot\nURL: https://www.nasdaq.com/\nRevenue growth remains strong, but margin guidance is slightly conservative for next quarter.',
    'demo-user-1'
  ),
  (
    'demo-note-2',
    'Title: AAPL product cycle check\nURL: https://www.apple.com/newsroom/\nServices segment stays resilient; hardware demand depends on replacement cycle in H2.',
    'demo-user-1'
  ),
  (
    'demo-note-3',
    'Title: TSLA delivery watch\nURL: https://ir.tesla.com/\nMarket focuses on delivery trend and gross margin recovery speed.',
    'demo-user-2'
  )
ON CONFLICT ("id") DO UPDATE
SET
  "text" = EXCLUDED."text",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Demo financial research notes
INSERT INTO "FinNote" ("id", "text", "authorId")
VALUES
  (
    'demo-finnote-1',
    'Sector: Semiconductors\nView: AI infrastructure demand still supports premium valuation, but sensitivity to guidance is rising.',
    'demo-user-1'
  ),
  (
    'demo-finnote-2',
    'Sector: EV\nView: Pricing pressure remains, monitor operating leverage and cash flow quality.',
    'demo-user-2'
  )
ON CONFLICT ("id") DO UPDATE
SET
  "text" = EXCLUDED."text",
  "updatedAt" = CURRENT_TIMESTAMP;
