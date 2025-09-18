
import React, { useState, useMemo } from 'react';
//-FIX: Import `Metrics` type to be used in type assertions later.
import type { AnalysisResults, AllMetrics, CorrelationMatrix, ProductsData, ScoringResult, Metrics } from '../types';
import { CHART_COLORS, METRIC_HEADERS, TIME_RANGE_METRIC_HEADERS } from '../constants';
import { calculateMetrics, fmtDate } from '../utils';
import { ChartCanvas } from './common';

const formatCell = (header: string, val: any): string => {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    if (header.includes('%')) return `${Number(val).toFixed(2)}%`;
    if (header.includes('夏普比率') || header.includes('时间跨度')) return Number(val).toFixed(2);
    if (header.includes('修复时间')) return String(Math.round(val));
    return String(val);
};

const MetricsTable: React.FC<{ metrics: AllMetrics, productNames: string[] }> = ({ metrics, productNames }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品名称</th>
                    {METRIC_HEADERS.map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {productNames.map(name => (
                    <tr key={name} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{name}</td>
                        {METRIC_HEADERS.map(h => (
                            <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatCell(h, metrics[name]?.[h])}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const CorrelationTable: React.FC<{ correlation: CorrelationMatrix | null, productNames: string[] }> = ({ correlation, productNames }) => {
    if (!correlation) return null;
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                        {productNames.map(name => <th key={name} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {productNames.map(rowName => (
                        <tr key={rowName} className="hover:bg-gray-50 border-t border-gray-200">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{rowName}</td>
                            {productNames.map(colName => {
                                const val = correlation[rowName]?.[colName];
                                const alpha = Math.min(0.6, Math.abs(val ?? 0));
                                const bgColor = `rgba(22, 93, 255, ${alpha})`;
                                const color = alpha > 0.35 ? 'white' : '#1D2129';
                                return (
                                    <td key={colName} className="px-4 py-3 text-sm text-right" style={{ backgroundColor: bgColor, color }}>
                                        {val !== undefined ? val.toFixed(4) : '-'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const ScoringResultsDisplay: React.FC<{ result: ScoringResult | null }> = ({ result }) => {
    if (!result) return <p className="text-gray-500 italic">尚未进行产品打分。</p>;
    
    const { productName, scores, weights, productType, isNeutralArbitrage, isIndexEnhanced, metrics, excessReturn, consistency, monthlyWinRate, sharpe } = result;
    
    let criteria: any[] = [];

    if (productType === '权益类产品') {
        criteria = [
            { name: '历史收益', key: 'historicalReturn', unit: '%', value: metrics['年化收益(%)'] },
            { name: '超额收益', key: 'excessReturn', unit: '%', value: excessReturn },
            isIndexEnhanced && { name: '月度胜率', key: 'monthlyWinRate', unit: '%', value: monthlyWinRate },
            { name: '业绩一致性', key: 'consistency', unit: '', value: consistency },
            { name: '近一年波动率', key: 'volatility', unit: '%', value: metrics['近一年波动率(%)'] },
            { name: '最大回撤', key: 'maxDrawdown', unit: '%', value: metrics['最大回撤(%)'] },
        ];
    } else if (productType === '固定收益类产品') {
        criteria = [
            { name: '历史收益', key: 'historicalReturn', unit: '%', value: metrics['年化收益(%)'] },
            { name: '超额收益', key: 'excessReturn', unit: '%', value: excessReturn },
            { name: '业绩一致性', key: 'consistency', unit: '', value: consistency },
            { name: '近一年波动率', key: 'volatility', unit: '%', value: metrics['近一年波动率(%)'] },
            { name: '最大回撤', key: 'maxDrawdown', unit: '%', value: metrics['最大回撤(%)'] },
        ];
    } else if (productType === '商品、衍生品、另类策略') {
        criteria = [
            { name: '历史收益', key: 'historicalReturn', unit: '%', value: metrics['年化收益(%)'] },
            { name: '风险调整后收益 (夏普)', key: 'sharpe', unit: '', value: sharpe },
            { name: '月度胜率', key: 'monthlyWinRate', unit: '%', value: monthlyWinRate },
            { name: '业绩一致性', key: 'consistency', unit: '', value: consistency },
            { name: '风险指标 (最大回撤)', key: 'maxDrawdown', unit: '%', value: metrics['最大回撤(%)'] },
        ];
    }
    criteria = criteria.filter(Boolean);


    const getRating = (score: number) => {
        if (score >= 80) return { text: '优秀', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
        if (score >= 60) return { text: '良好', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
        if (score >= 40) return { text: '一般', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' };
        return { text: '较差', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    };

    const rating = getRating(scores.total);
    
    const subType = isNeutralArbitrage ? ' - 中性套利' : isIndexEnhanced ? ' - 指数增强' : '';

    return (
        <div className="overflow-x-auto">
            <h3 className="text-lg font-semibold mb-4">{productName} 打分结果 ({productType}{subType})</h3>
            <div className={`mb-6 p-4 rounded-lg ${rating.bg}`}>
                <div className="flex items-center justify-between">
                     <div>
                        <span className="font-semibold">总体评级：</span>
                        <span className={`text-lg font-bold ${rating.color}`}>{rating.text}</span>
                    </div>
                    <div className="text-2xl font-bold text-primary">总分: {scores.total.toFixed(2)}</div>
                </div>
            </div>
            
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">指标</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">数值</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">权重</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">得分</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">加权得分</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                {criteria.map((c: any) => {
                    if (!c.key || weights[c.key] === undefined) return null;
                    const score = scores[c.key];
                    const weight = weights[c.key];
                    const weightedScore = score * weight;
                     const scoreColor = score >= 66 ? 'text-green-600 font-semibold' : score >= 33 ? 'text-yellow-600' : 'text-red-600';

                    return (
                        <tr key={c.key} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{isNaN(c.value) ? '-' : `${c.value.toFixed(2)}${c.unit}`}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{`${(weight * 100).toFixed(0)}%`}</td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${scoreColor}`}>{isNaN(score) ? '-' : score.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{isNaN(weightedScore) ? '-' : weightedScore.toFixed(2)}</td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
};


const TimeRangeAnalysis: React.FC<{ selectedProducts: string[]; productsData: ProductsData; timeRange: string; }> = ({ selectedProducts, productsData, timeRange }) => {

    const { timeRangeMetrics, chartConfig } = useMemo(() => {
        const metrics: AllMetrics = {};
        const getDateRange = (data: any[]) => {
            if (!data || data.length === 0) return { start: null, end: null };
            const endDate = data[data.length - 1].date;
            let startDate = new Date(endDate);
            switch (timeRange) {
                case 'all': startDate = data[0].date; break;
                case '5y': startDate.setFullYear(startDate.getFullYear() - 5); break;
                case '3y': startDate.setFullYear(startDate.getFullYear() - 3); break;
                case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break;
                case 'ytd': startDate = new Date(endDate.getFullYear(), 0, 1); break;
                case '1m': startDate.setMonth(startDate.getMonth() - 1); break;
            }
            if (startDate < data[0].date) startDate = data[0].date;
            return { start: startDate, end: endDate };
        };

        const dateSet = new Set<number>();
        selectedProducts.forEach(name => {
            const data = productsData[name];
            const range = getDateRange(data);
            metrics[name] = calculateMetrics(data, range.start, range.end);
            if (metrics[name]) {
                const filtered = data.filter(d => d.date >= range.start! && d.date <= range.end!);
                filtered.forEach(d => dateSet.add(d.date.getTime()));
            }
        });
        
        const dates = Array.from(dateSet).map(ms => new Date(ms)).sort((a,b) => a.getTime() - b.getTime());
        const labels = dates.map(fmtDate);
        
        const datasets = selectedProducts.map((name, idx) => {
            const data = productsData[name];
            const range = getDateRange(data);
            const filtered = data.filter(d => d.date >= range.start! && d.date <= range.end!);
            if(filtered.length === 0) return null;

            const map = new Map(filtered.map(d => [d.date.getTime(), d.net_value]));
            const firstValue = filtered[0].net_value;
            const values = dates.map(d => {
                const val = map.get(d.getTime());
                return val != null ? val / firstValue : null;
            });
            
            return {
                label: name,
                data: values,
                borderColor: CHART_COLORS[idx % CHART_COLORS.length],
                backgroundColor: 'transparent',
                tension: 0,
                pointRadius: 0,
                spanGaps: true,
            };
        }).filter(Boolean);

        const config = {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw == null ? '-' : Number(ctx.raw).toFixed(4)}` } } },
                scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { title: { display: true, text: '归一化净值' } } }
            }
        };

        return { timeRangeMetrics: metrics, chartConfig: config };
    }, [selectedProducts, productsData, timeRange]);

    return (
        <>
            <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4"><i className="fa fa-calendar text-primary mr-2"></i>时间区间分析结果</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品名称</th>
                                {TIME_RANGE_METRIC_HEADERS.map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {selectedProducts.map(name => (
                                <tr key={name}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{name}</td>
                                    {TIME_RANGE_METRIC_HEADERS.map(h => (
                                        //-FIX: Corrected the typo 'M' and used a proper type assertion 'h as keyof Metrics'.
                                        <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatCell(h, timeRangeMetrics[name]?.[h as keyof Metrics])}</td>
                                    ))}
                                </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4"><i className="fa fa-line-chart text-primary mr-2"></i>时间区间净值曲线</h2>
                <ChartCanvas chartConfig={chartConfig} />
            </div>
        </>
    );
};



interface ResultsProps {
    results: AnalysisResults | null;
    productsData: ProductsData;
    selectedProducts: string[];
    scoringResult: ScoringResult | null;
    timeRange: string;
    onExport: () => void;
    groupCorrelationTables: React.ReactNode;
}

const Results: React.FC<ResultsProps> = ({ results, productsData, selectedProducts, scoringResult, timeRange, onExport, groupCorrelationTables }) => {
    const [activeTab, setActiveTab] = useState('metrics');

    const TABS = [
        { id: 'metrics', label: '指标汇总' },
        { id: 'time-range', label: '时间区间分析' },
        { id: 'scoring', label: '产品打分' },
    ];

    const { netValueChartConfig, drawdownChartConfig } = useMemo(() => {
        if (!results) return { netValueChartConfig: null, drawdownChartConfig: null };

        const dateSet = new Set<number>();
        selectedProducts.forEach(n => productsData[n]?.forEach(r => dateSet.add(r.date.getTime())));
        const dates = Array.from(dateSet).map(ms => new Date(ms)).sort((a, b) => a.getTime() - b.getTime());
        const labels = dates.map(fmtDate);

        const netDatasets: any[] = [];
        const ddDatasets: any[] = [];
        selectedProducts.forEach((n, idx) => {
            const data = productsData[n];
            if(!data) return;

            const map = new Map(data.map(r => [r.date.getTime(), r.net_value]));
            const color = CHART_COLORS[idx % CHART_COLORS.length];

            const vals = dates.map(d => map.get(d.getTime()) ?? null);
            netDatasets.push({ label: n, data: vals, borderColor: color, backgroundColor: 'transparent', tension: 0, pointRadius: 0, spanGaps: true });

            const ownDates = data.map(r => r.date);
            const ownVals = data.map(r => r.net_value);
            const cumMax: number[] = [];
            const dd: number[] = [];
            let m = ownVals[0];
            for (let i = 0; i < ownVals.length; i++) { m = Math.max(m, ownVals[i]); cumMax.push(m); dd.push((ownVals[i] - m) / m * 100); }
            const ddMap = new Map(ownDates.map((d, i) => [d.getTime(), dd[i]]));
            const ddSeries = dates.map(d => ddMap.get(d.getTime()) ?? null);
            
            const hexWithAlpha = (hex: string, alpha: number) => {
                const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                if (!m) return 'rgba(0,0,0,0.15)';
                const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
                return `rgba(${r},${g},${b},${alpha})`;
            }
            ddDatasets.push({ label: n, data: ddSeries, borderColor: color, backgroundColor: hexWithAlpha(color, 0.2), tension: 0, pointRadius: 0, fill: true, spanGaps: true });
        });
        
        const netConfig = { type: 'line', data: { labels, datasets: netDatasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw == null ? '-' : Number(ctx.raw).toFixed(4)}` } } }, scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { title: { display: true, text: '净值' } } } } };
        const ddConfig = { type: 'line', data: { labels, datasets: ddDatasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw == null ? '-' : Number(ctx.raw).toFixed(2)}%` } } }, scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { title: { display: true, text: '回撤(%)' }, ticks: { callback: (v: any) => `${v}%` } } } } };

        return { netValueChartConfig: netConfig, drawdownChartConfig: ddConfig };
    }, [results, selectedProducts, productsData]);


    if (!results) return null;

    return (
        <section>
            <div className="flex border-b border-gray-200 mb-6">
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn px-4 py-2 font-medium border-b-2 border-transparent ${activeTab === tab.id ? 'tab-active' : ''}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'metrics' && (
                <div>
                    <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                        <h2 className="text-lg font-semibold mb-4"><i className="fa fa-table text-primary mr-2"></i>指标汇总</h2>
                        <MetricsTable metrics={results.metrics} productNames={selectedProducts} />
                    </div>
                    {selectedProducts.length >= 2 && (
                      <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                          <h2 className="text-lg font-semibold mb-4"><i className="fa fa-exchange text-primary mr-2"></i>全局相关性矩阵 (基于周收益率)</h2>
                          <CorrelationTable correlation={results.correlation} productNames={selectedProducts} />
                      </div>
                    )}
                    {groupCorrelationTables}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white rounded-xl shadow-card p-6">
                            <h2 className="text-lg font-semibold mb-4"><i className="fa fa-line-chart text-primary mr-2"></i>净值曲线</h2>
                            <ChartCanvas chartConfig={netValueChartConfig} />
                        </div>
                        <div className="bg-white rounded-xl shadow-card p-6">
                            <h2 className="text-lg font-semibold mb-4"><i className="fa fa-area-chart text-primary mr-2"></i>回撤曲线</h2>
                            <ChartCanvas chartConfig={drawdownChartConfig} />
                        </div>
                    </div>
                </div>
            )}
            
            {activeTab === 'time-range' && (
                <TimeRangeAnalysis selectedProducts={selectedProducts} productsData={productsData} timeRange={timeRange} />
            )}

            {activeTab === 'scoring' && (
                <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                    <h2 className="text-lg font-semibold mb-4"><i className="fa fa-star text-primary mr-2"></i>产品打分结果</h2>
                    <ScoringResultsDisplay result={scoringResult} />
                </div>
            )}
            
            <div className="flex justify-end">
                <button onClick={onExport} className="bg-secondary text-white px-6 py-2 rounded-lg hover:bg-secondary/90 transition-all-300">
                    <i className="fa fa-download mr-2"></i>导出结果 CSV
                </button>
            </div>
        </section>
    );
};

export default Results;