-- Secondary tags (distinct from the required primary_tag) turned out unused
-- in practice — dropping the column and all supporting code.
ALTER TABLE places
  DROP COLUMN tags;
