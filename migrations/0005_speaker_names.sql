-- Custom speaker names for quote-ready exports. Null until a journalist renames someone.
ALTER TABLE transcripts ADD COLUMN speakers_json TEXT;
