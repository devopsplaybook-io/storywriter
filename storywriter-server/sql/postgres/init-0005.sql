-- Add the per-book writing goal (word count target; 0 = no goal).

ALTER TABLE books ADD COLUMN "writingGoal" INTEGER NOT NULL DEFAULT 0;
