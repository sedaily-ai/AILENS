export interface EconomicSnapshot {
  kospi: number;
  usdKrw: number;
  baseRate: number; // 기준금리 %
}

// 연도별 연평균 목업 데이터
const SNAPSHOTS_BY_YEAR: Record<number, EconomicSnapshot> = {
  1990: { kospi: 696,  usdKrw: 716,  baseRate: 10.0 },
  1991: { kospi: 610,  usdKrw: 733,  baseRate: 10.0 },
  1992: { kospi: 678,  usdKrw: 780,  baseRate: 10.0 },
  1993: { kospi: 866,  usdKrw: 802,  baseRate: 8.5  },
  1994: { kospi: 1027, usdKrw: 788,  baseRate: 8.5  },
  1995: { kospi: 882,  usdKrw: 774,  baseRate: 9.0  },
  1996: { kospi: 651,  usdKrw: 844,  baseRate: 8.25 },
  1997: { kospi: 376,  usdKrw: 1415, baseRate: 15.0 },
  1998: { kospi: 562,  usdKrw: 1204, baseRate: 8.0  },
  1999: { kospi: 1028, usdKrw: 1145, baseRate: 5.0  },
  2000: { kospi: 504,  usdKrw: 1259, baseRate: 5.25 },
  2001: { kospi: 694,  usdKrw: 1291, baseRate: 4.0  },
  2002: { kospi: 627,  usdKrw: 1251, baseRate: 4.25 },
  2003: { kospi: 810,  usdKrw: 1192, baseRate: 3.75 },
  2004: { kospi: 895,  usdKrw: 1145, baseRate: 3.25 },
  2005: { kospi: 1379, usdKrw: 1024, baseRate: 3.5  },
  2006: { kospi: 1434, usdKrw: 955,  baseRate: 4.5  },
  2007: { kospi: 1897, usdKrw: 929,  baseRate: 5.0  },
  2008: { kospi: 1124, usdKrw: 1259, baseRate: 3.0  },
  2009: { kospi: 1682, usdKrw: 1167, baseRate: 2.0  },
  2010: { kospi: 2051, usdKrw: 1156, baseRate: 2.5  },
  2011: { kospi: 1826, usdKrw: 1108, baseRate: 3.25 },
  2012: { kospi: 1997, usdKrw: 1127, baseRate: 2.75 },
  2013: { kospi: 2011, usdKrw: 1095, baseRate: 2.5  },
  2014: { kospi: 1916, usdKrw: 1053, baseRate: 2.0  },
  2015: { kospi: 1961, usdKrw: 1172, baseRate: 1.5  },
  2016: { kospi: 2026, usdKrw: 1208, baseRate: 1.25 },
  2017: { kospi: 2467, usdKrw: 1131, baseRate: 1.5  },
  2018: { kospi: 2041, usdKrw: 1100, baseRate: 1.75 },
  2019: { kospi: 2197, usdKrw: 1166, baseRate: 1.25 },
  2020: { kospi: 2873, usdKrw: 1086, baseRate: 0.5  },
  2021: { kospi: 2977, usdKrw: 1188, baseRate: 1.0  },
  2022: { kospi: 2236, usdKrw: 1264, baseRate: 3.25 },
  2023: { kospi: 2655, usdKrw: 1289, baseRate: 3.5  },
  2024: { kospi: 2404, usdKrw: 1387, baseRate: 3.0  },
  2025: { kospi: 2520, usdKrw: 1450, baseRate: 2.75 },
};

// 현재 목업 데이터
export const CURRENT_SNAPSHOT: EconomicSnapshot = {
  kospi: 2580,
  usdKrw: 1462,
  baseRate: 2.75,
};

export function getSnapshotByDate(dateStr: string): EconomicSnapshot {
  const year = new Date(dateStr).getFullYear();
  return SNAPSHOTS_BY_YEAR[year] ?? SNAPSHOTS_BY_YEAR[2024];
}
