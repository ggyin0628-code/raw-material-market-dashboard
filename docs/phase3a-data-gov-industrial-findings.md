# Phase 3A Taiwan data.gov industrial-production findings

Source: https://data.gov.tw/en/datasets/6607

The Taiwan government open-data platform lists “Industrial production” as industrial production index and statistical value of industrial production. The agency is the Ministry of Economic Affairs, the official CSV resource is https://service.moea.gov.tw/EE520/opendata/d.csv, the dataset is free, licensed under Open Government Data License version 1.0, classified as primary government data, and marked for irregular updates. The page records an updated time of 2026-06-01 08:44.

This is a strong candidate for a public Taiwan demand/activity proxy. Because its update frequency is irregular, the implementation must use actual observation dates and freshness rules, preserve the index/value field definitions, and avoid treating it as sheet-metal supplier pricing. The stable CSV endpoint should be inspected before use and only the required bounded public series should be collected.

The downloaded official CSV was inspected on 2026-08-23. It contains monthly `生產指數` rows with `110年=100` for the exact industry codes `24 基本金屬製造業` (latest inspected period `11506`, value `79.12`), `25 金屬製品製造業` (latest `11506`, value `110.03`), and `29 機械設備製造業` (latest `11506`, value `108.68`). These are observed index values, not prices. The fabricated-metal row is a truthful Taiwan-specific capacity/demand proxy candidate for Phase 3A, subject to the dataset's irregular-update metadata and actual-date freshness handling.
