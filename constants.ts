
export const RISK_FREE_RATE = 0.02;
export const WEEKLY_ANNUALIZATION = 52;

export const METRIC_HEADERS: (keyof import('./types').Metrics)[] = [
  '成立日期', '实际时间跨度(年)', '累计收益(%)', '年化收益(%)',
  '波动率(%)', '夏普比率', '最大回撤(%)', '最大回撤修复时间(天)',
  '近一年收益(%)', '近一年波动率(%)', '近一年区间'
];

export const TIME_RANGE_METRIC_HEADERS = [
    '累计收益(%)', '年化收益(%)', '波动率(%)', '夏普比率', '最大回撤(%)'
];


export const CHART_COLORS = ['#165DFF', '#36CFC9', '#722ED1', '#FF7D00', '#F53F3F', '#86909C', '#0FC6C2', '#7BC616', '#F7BA1E', '#E53E3E'];
