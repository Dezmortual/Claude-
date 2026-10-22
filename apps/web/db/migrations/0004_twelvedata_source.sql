-- Twelve Data becomes the forex source (real highs and lows, 5-minute to weekly); the ECB stays as the fallback.
alter table assets drop constraint assets_source_check;
alter table assets add constraint assets_source_check check (source in ('binance','twelvedata','frankfurter','alpaca','yields','demo'));
