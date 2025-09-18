
export interface ProductDataPoint {
  date: Date;
  net_value: number;
}

export type ProductsData = Record<string, ProductDataPoint[]>;

export interface Metrics {
  '成立日期': string;
  '实际时间跨度(年)': number;
  '累计收益(%)': number;
  '年化收益(%)': number;
  '波动率(%)': number;
  '夏普比率': number;
  '最大回撤(%)': number;
  '最大回撤修复时间(天)': number;
  '近一年收益(%)': number;
  '近一年波动率(%)': number;
  '近一年区间': string;
}

export type AllMetrics = Record<string, Metrics | null>;

export interface Group {
  name: string;
  products: string[];
}

export enum ProductType {
  Equity = '权益类产品',
  FixedIncome = '固定收益类产品',
  Alternative = '商品、衍生品、另类策略',
}

export interface Score {
    [key: string]: number;
}

export interface ScoringResult {
    productName: string;
    metrics: Metrics;
    excessReturn: number;
    consistency: number;
    monthlyWinRate: number;
    sharpe: number;
    scores: Score;
    weights: Record<string, number>;
    productType: ProductType;
    isNeutralArbitrage?: boolean;
    isIndexEnhanced?: boolean;
}

export type CorrelationMatrix = Record<string, Record<string, number>>;

export interface AnalysisResults {
    metrics: AllMetrics;
    correlation: CorrelationMatrix | null;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'danger' | 'warning' | 'info';
}