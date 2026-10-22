-- The forecast ledger lists forecasts newest first, overall and per asset.
create index if not exists forecasts_generated_at_idx on forecasts (generated_at desc);
create index if not exists forecasts_asset_generated_idx on forecasts (asset_id, generated_at desc);
