
import * as XLSX from 'xlsx';
//-FIX: 'ProductType' is an enum, which has a runtime representation, so it cannot be imported using 'import type'.
import type { ProductDataPoint, ProductsData, Metrics } from './types';
import { ProductType } from './types';
import { RISK_FREE_RATE, WEEKLY_ANNUALIZATION } from './constants';

// --- Excel Parsing Utilities ---

const parseExcelDate = (val: any): Date | null => {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = val * 24 * 3600 * 1000;
    return new Date(epoch.getTime() + ms);
  }
  if (typeof val === 'string') {
    const s = val.replace(/年|月/g, '-').replace(/日/g, '').replace(/[^\d\-\/: ]/g, '');
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const parseNumber = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const x = parseFloat(v.replace(/,/g, '').trim());
    return isNaN(x) ? NaN : x;
  }
  return NaN;
};

export const parseExcelFile = async (file: File): Promise<ProductDataPoint[]> => {
  const arrayBuf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array', cellDates: true, raw: false });
  let sheet: any[][] | null = null;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    if (rows && rows.length >= 2) {
      sheet = rows;
      break;
    }
  }
  if (!sheet) throw new Error('No valid data found in the file.');

  const bodyRows = sheet.slice(1).filter(r => r && (r[0] != null || r[1] != null));
  const parsed: ProductDataPoint[] = [];
  for (const r of bodyRows) {
    const d = parseExcelDate(r[0]);
    const v = parseNumber(r[1]);
    if (d && !Number.isNaN(v)) parsed.push({ date: d, net_value: v });
  }
  
  if (parsed.length === 0) throw new Error('No valid (Date, Net Value) data rows found.');

  parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  return parsed;
};

// --- Financial Calculation Utilities ---

const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
const avg = (arr: number[]): number => arr.reduce((s, x) => s + x, 0) / arr.length;
const round2 = (x: number): number => Math.round(x * 100) / 100;
export const fmtDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sampleStd = (arr: number[]): number => {
  const n = arr.length;
  if (n < 2) return NaN;
  const mean = avg(arr);
  const ss = arr.reduce((s, x) => s + (x - mean) ** 2, 0);
  return Math.sqrt(ss / (n - 1));
};

const calcMaxDrawdown = (values: number[]): number => {
  const cumMax: number[] = [];
  let m = values[0];
  for (let i = 0; i < values.length; i++) {
    m = Math.max(m, values[i]);
    cumMax.push(m);
  }
  let minDD = 0;
  for (let i = 0; i < values.length; i++) {
    const dd = (values[i] - cumMax[i]) / cumMax[i];
    if (dd < minDD) minDD = dd;
  }
  return minDD;
};

const calcMaxDrawdownRecovery = (values: number[], dates: Date[]): number => {
  const n = values.length;
  const cumMax = new Array(n);
  let m = values[0];
  for (let i = 0; i < n; i++) { m = Math.max(m, values[i]); cumMax[i] = m; }
  const drawdown = values.map((v, i) => (v - cumMax[i]) / cumMax[i]);

  const peaks = [0];
  for (let i = 1; i < n; i++) { if (cumMax[i] > cumMax[i - 1]) peaks.push(i); }

  let maxRec = 0;
  for (const p of peaks) {
    let troughIdx = p, troughVal = drawdown[p];
    for (let i = p; i < n; i++) { if (drawdown[i] < troughVal) { troughVal = drawdown[i]; troughIdx = i; } }
    let recIdx = -1;
    for (let i = troughIdx + 1; i < n; i++) { if (values[i] >= cumMax[p]) { recIdx = i; break; } }
    if (recIdx !== -1) {
      const recDays = Math.max(0, daysBetween(dates[troughIdx], dates[recIdx]));
      if (recDays > maxRec) maxRec = recDays;
    }
  }
  return maxRec > 0 ? maxRec : NaN;
};

const findClosestDate = (dates: Date[], target: Date): Date => {
  let best = dates[0], mind = Math.abs(dates[0].getTime() - target.getTime());
  for (const d of dates) { const diff = Math.abs(d.getTime() - target.getTime()); if (diff < mind) { mind = diff; best = d; } }
  return best;
};

export const findClosestValue = (data: ProductDataPoint[], targetDate: Date): number => {
      let closest = data[0];
      let minDiff = Math.abs(data[0].date.getTime() - targetDate.getTime());
      
      for (let i = 1; i < data.length; i++) {
        const diff = Math.abs(data[i].date.getTime() - targetDate.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closest = data[i];
        }
      }
      return closest.net_value;
}

const computeWeeklyReturns = (values: number[], dates: Date[]): number[] => {
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const days = Math.max(1, (dates[i].getTime() - dates[i - 1].getTime()) / (24 * 3600 * 1000));
    const weeks = Math.max(days / 7, 1);
    const r = Math.pow(values[i] / values[i - 1], 1 / weeks) - 1;
    rets.push(r);
  }
  return rets;
};

export const calculateMetrics = (dataRows: ProductDataPoint[], startDate?: Date, endDate?: Date): Metrics | null => {
  if (!dataRows || dataRows.length < 2) return null;
  let filteredData = dataRows;
  if (startDate || endDate) {
    filteredData = dataRows.filter(d => (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate));
  }
  if (filteredData.length < 2) return null;

  const dates = filteredData.map(d => d.date);
  const values = filteredData.map(d => d.net_value);

  const start = dates[0], end = dates[dates.length - 1];
  const actualDays = Math.max(0, daysBetween(start, end));
  const actualYears = actualDays / 365;

  const totalReturn = (values[values.length - 1] / values[0] - 1) * 100;
  let annualReturn = NaN;
  if (actualDays >= 7 && totalReturn > -100) {
    annualReturn = (Math.pow(1 + totalReturn / 100, 1 / actualYears) - 1) * 100;
  }

  const weeklyRets = computeWeeklyReturns(values, dates);
  if (weeklyRets.length < 1) return null;
  const vol = sampleStd(weeklyRets) * Math.sqrt(WEEKLY_ANNUALIZATION) * 100;
  const weeklyRf = RISK_FREE_RATE / WEEKLY_ANNUALIZATION;
  const sharpe = (sampleStd(weeklyRets) === 0) ? NaN : ((avg(weeklyRets) - weeklyRf) / sampleStd(weeklyRets)) * Math.sqrt(WEEKLY_ANNUALIZATION);

  const mddPct = calcMaxDrawdown(values) * 100;
  const mddRecDays = calcMaxDrawdownRecovery(values, dates);

  const endDateForYear = end;
  const startYear = new Date(endDateForYear); startYear.setDate(startYear.getDate() - 365);
  const closestStart = findClosestDate(dataRows.map(r => r.date), startYear);
  const lastYearPeriod = `${fmtDate(closestStart)} 至 ${fmtDate(endDateForYear)}`;

  const lastYearRows = dataRows.filter(d => d.date >= startYear && d.date <= endDateForYear);
  let lastYearReturn = NaN, lastYearVol = NaN;
  if (lastYearRows.length >= 2) {
    const lyDates = lastYearRows.map(x => x.date);
    const lyValues = lastYearRows.map(x => x.net_value);
    const lyDays = Math.max(0, daysBetween(lyDates[0], lyDates[lyDates.length - 1]));
    const lyYears = lyDays / 365;
    const lyTotal = (lyValues[lyValues.length - 1] / lyValues[0] - 1) * 100;
    if (lyDays >= 7) lastYearReturn = (Math.pow(1 + lyTotal / 100, 1 / lyYears) - 1) * 100;
    const lyRets = computeWeeklyReturns(lyValues, lyDates);
    if (lyRets.length >= 2) lastYearVol = sampleStd(lyRets) * Math.sqrt(WEEKLY_ANNUALIZATION) * 100;
  }

  return {
    '成立日期': fmtDate(dates[0]),
    '实际时间跨度(年)': round2(actualYears),
    '累计收益(%)': round2(totalReturn),
    '年化收益(%)': isFinite(annualReturn) ? round2(annualReturn) : NaN,
    '波动率(%)': round2(vol),
    '夏普比率': isFinite(sharpe) ? round2(sharpe) : NaN,
    '最大回撤(%)': round2(mddPct),
    '最大回撤修复时间(天)': isFinite(mddRecDays) ? Math.round(mddRecDays) : NaN,
    '近一年收益(%)': isFinite(lastYearReturn) ? round2(lastYearReturn) : NaN,
    '近一年波动率(%)': isFinite(lastYearVol) ? round2(lastYearVol) : NaN,
    '近一年区间': lastYearPeriod
  };
};

export const analyzeCorrelation = (selected: string[], productsData: ProductsData): Record<string, Record<string, number>> | null => {
  if (selected.length < 2) return null;

  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const dateSets = selected.map(name => new Set(productsData[name].map(r => dateKey(r.date))));
  let common = [...dateSets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))];
  if (common.length < 2) return null;

  const commonDates = common.map(s => new Date(s)).sort((a, b) => a.getTime() - b.getTime());

  const aligned: Record<string, number[]> = {};
  for (const name of selected) {
    const map = new Map(productsData[name].map(r => [dateKey(r.date), r.net_value]));
    aligned[name] = commonDates.map(d => map.get(dateKey(d))!);
  }

  const returns: Record<string, number[]> = {};
  for (const name of selected) {
    returns[name] = computeWeeklyReturns(aligned[name], commonDates);
  }

  const len = Math.min(...Object.values(returns).map(r => r.length));
  if (len < 1) return null;
  for (const k in returns) { returns[k] = returns[k].slice(0, len); }

  const corr: Record<string, Record<string, number>> = {};
  for (const a of selected) {
    corr[a] = {};
    for (const b of selected) {
      if (a === b) { corr[a][b] = 1; continue; }
      const x = returns[a], y = returns[b];
      const mx = avg(x), my = avg(y);
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < len; i++) {
        const dx = x[i] - mx, dy = y[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
      }
      corr[a][b] = (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : 0;
    }
  }
  return corr;
};

export const calculateMonthlyWinRate = (productData: ProductDataPoint[], benchmarkData: ProductDataPoint[]): number => {
    if (!productData || productData.length < 2 || !benchmarkData || benchmarkData.length < 2) return NaN;
    
    const dateToValue = (data: ProductDataPoint[]) => {
        const map = new Map<string, { date: Date, value: number }>(); // YYYY-MM -> last day's data
        for (const { date, net_value } of data) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const existing = map.get(key);
            if (!existing || date > existing.date) {
                map.set(key, { date, value: net_value });
            }
        }
        return new Map(Array.from(map.entries()).map(([key, { value }]) => [key, value]));
    };
    
    const productMonthlyValues = dateToValue(productData);
    const benchmarkMonthlyValues = dateToValue(benchmarkData);

    const commonMonths = Array.from(productMonthlyValues.keys())
                              .filter(key => benchmarkMonthlyValues.has(key))
                              .sort();
    
    if (commonMonths.length < 2) return NaN;

    let winCount = 0;
    for (let i = 1; i < commonMonths.length; i++) {
        const prevMonth = commonMonths[i - 1];
        const currMonth = commonMonths[i];

        const productReturn = productMonthlyValues.get(currMonth)! / productMonthlyValues.get(prevMonth)! - 1;
        const benchmarkReturn = benchmarkMonthlyValues.get(currMonth)! / benchmarkMonthlyValues.get(prevMonth)! - 1;

        if (productReturn > benchmarkReturn) {
            winCount++;
        }
    }

    const totalComparisons = commonMonths.length - 1;
    return totalComparisons > 0 ? (winCount / totalComparisons) * 100 : NaN;
};


// --- Scoring Calculation Utilities ---

const calculateEquityReturnScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 12) return 100;
    if (val >= 8) return 66;
    if (val >= 4) return 33;
    return 0;
};
const calculateEquityConsistencyScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 0.95) return 100;
    if (val >= 0.90) return 50;
    return 0;
};
const calculateEquityVolatilityScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val <= 20) return 100;
    if (val <= 25) return 66;
    if (val <= 30) return 33;
    return 0;
};
const calculateEquityDrawdownScore = (val: number) => {
    if (isNaN(val)) return 0;
    const absVal = Math.abs(val);
    if (absVal <= 20) return 100;
    if (absVal <= 30) return 75;
    if (absVal <= 40) return 50;
    if (absVal <= 50) return 25;
    return 0;
};

const calculateMonthlyWinRateScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 60) return 100;
    if (val >= 50) return 50;
    return 0;
};

const calculateFixedIncomeReturnScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 4) return 100;
    if (val >= 2.5) return 66;
    if (val >= 1.5) return 33;
    return 0;
};
const calculateFixedIncomeExcessReturnScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 4) return 100;
    if (val >= 2) return 66;
    if (val >= 0) return 33;
    return 0;
};
const calculateFixedIncomeConsistencyScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 0.97) return 100;
    if (val >= 0.92) return 50;
    return 0;
};
const calculateFixedIncomeVolatilityScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val <= 1) return 100;
    if (val <= 2) return 66;
    if (val <= 3.5) return 33;
    return 0;
};
const calculateFixedIncomeDrawdownScore = (val: number) => {
    if (isNaN(val)) return 0;
    const absVal = Math.abs(val);
    if (absVal <= 2) return 100;
    if (absVal <= 4) return 66;
    if (absVal <= 8) return 33;
    return 0;
};

const calculateAlternativeReturnScore = (val: number, isNeutral: boolean) => {
    if (isNaN(val)) return 0;
    if (isNeutral) {
        if (val >= 6) return 100;
        if (val >= 4) return 66;
        if (val >= 2) return 33;
        return 0;
    }
    // Fallback to equity score as per image, which shows the same >=12% etc. tiers
    if (val >= 12) return 100;
    if (val >= 8) return 66;
    if (val >= 4) return 33;
    return 0;
};
const calculateAlternativeSharpeScore = (val: number) => {
    if (isNaN(val)) return 0;
    if (val >= 1.5) return 100;
    if (val >= 1.0) return 66;
    if (val >= 0.7) return 33;
    return 0;
};
const calculateAlternativeDrawdownScore = (val: number) => {
    if (isNaN(val)) return 0;
    const absVal = Math.abs(val);
    if (absVal <= 5) return 100;
    if (absVal <= 15) return 66;
    if (absVal <= 30) return 33;
    return 0;
};

export const calculateTotalScore = (scores: Record<string, number>, weights: Record<string, number>) => {
    let totalScore = 0;
    let totalWeight = 0;
    for (const key in scores) {
        if (weights[key] && !isNaN(scores[key])) {
            totalScore += scores[key] * (weights[key] || 0);
            totalWeight += (weights[key] || 0);
        }
    }
    // Normalize by sum of weights of metrics that are actually present
    return totalWeight > 0 ? totalScore / totalWeight : 0;
};

export const calculateScores = (
    productType: ProductType,
    metrics: Metrics,
    excessReturn: number,
    consistency: number,
    monthlyWinRate: number,
    isNeutralArbitrage: boolean,
    isIndexEnhanced: boolean
) => {
    let scores: Record<string, number> = {};
    let weights: Record<string, number> = {};
    
    switch (productType) {
        case ProductType.Equity:
            scores = {
                historicalReturn: calculateEquityReturnScore(metrics['年化收益(%)']),
                excessReturn: calculateEquityReturnScore(excessReturn),
                consistency: calculateEquityConsistencyScore(consistency),
                volatility: calculateEquityVolatilityScore(metrics['近一年波动率(%)']),
                maxDrawdown: calculateEquityDrawdownScore(metrics['最大回撤(%)']),
            };
            if (isIndexEnhanced) {
                scores.monthlyWinRate = calculateMonthlyWinRateScore(monthlyWinRate);
                weights = { historicalReturn: 0.22, excessReturn: 0.22, monthlyWinRate: 0.10, consistency: 0.22, volatility: 0.12, maxDrawdown: 0.12 };
            } else {
                weights = { historicalReturn: 0.22, excessReturn: 0.22, consistency: 0.22, volatility: 0.12, maxDrawdown: 0.22 };
            }
            break;
        case ProductType.FixedIncome:
            scores = {
                historicalReturn: calculateFixedIncomeReturnScore(metrics['年化收益(%)']),
                excessReturn: calculateFixedIncomeExcessReturnScore(excessReturn),
                consistency: calculateFixedIncomeConsistencyScore(consistency),
                volatility: calculateFixedIncomeVolatilityScore(metrics['近一年波动率(%)']),
                maxDrawdown: calculateFixedIncomeDrawdownScore(metrics['最大回撤(%)']),
            };
            weights = { historicalReturn: 0.22, excessReturn: 0.22, consistency: 0.22, volatility: 0.12, maxDrawdown: 0.22 };
            break;
        case ProductType.Alternative:
            scores = {
                historicalReturn: calculateAlternativeReturnScore(metrics['年化收益(%)'], isNeutralArbitrage),
                sharpe: calculateAlternativeSharpeScore(metrics['夏普比率']),
                monthlyWinRate: calculateMonthlyWinRateScore(monthlyWinRate),
                consistency: calculateEquityConsistencyScore(consistency),
                maxDrawdown: calculateAlternativeDrawdownScore(metrics['最大回撤(%)']),
            };
            weights = { historicalReturn: 0.22, sharpe: 0.22, monthlyWinRate: 0.22, consistency: 0.22, maxDrawdown: 0.12 };
            break;
    }

    scores.total = calculateTotalScore(scores, weights);
    return { scores, weights };
};