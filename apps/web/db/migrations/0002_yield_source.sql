-- Official government bond yields (US Treasury, Bundesbank, Bank of England) become a market-data source.
alter table assets drop constraint assets_source_check;
alter table assets add constraint assets_source_check check (source in ('binance','frankfurter','alpaca','yields','demo'));
