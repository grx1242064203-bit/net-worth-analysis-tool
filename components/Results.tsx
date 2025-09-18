import React, { useState, useMemo } from 'react';
//-FIX: Import `Metrics` type to be used in type assertions later.
import type { AnalysisResults, AllMetrics, CorrelationMatrix, ProductsData, ScoringResult, Metrics, ProductType } from '../types';
import { ProductType as ProductTypeEnum } from '../types';
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

const MetricsTable: React.FC<{ 
    metrics: AllMetrics, 
    productNames: string[],
    onSort: (key: string) => void,
    sortConfig: { key: string, direction: 'asc' | 'desc' } | null
}> = ({ metrics, productNames, onSort, sortConfig }) => {
    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <i className="fa fa-sort text-gray-400 ml-1"></i>;
        }
        const icon = sortConfig.direction === 'asc' ? 'fa-sort-asc' : 'fa-sort-desc';
        return <i className={`fa ${icon} text-primary ml-1`}></i>;
    };
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => onSort('productName')}>
                            产品名称 {getSortIcon('productName')}
                        </th>
                        {METRIC_HEADERS.map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => onSort(h)}>
                                {h} {getSortIcon(h)}
                            </th>
                        ))}
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
};

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

const SCORING_STANDARDS = {
    [ProductTypeEnum.Equity]: {
        name: '权益类产品评分标准',
        criteria: [
            { name: '历史收益 (年化)', tiers: ['≥12% 得100分', '≥8% 得66分', '≥4% 得33分'] },
            { name: '超额收益 (年化)', tiers: ['≥12% 得100分', '≥8% 得66分', '≥4% 得33分'] },
            { name: '月度胜率 (指数增强)', tiers: ['≥60% 得100分', '≥50% 得50分'] },
            { name: '业绩一致性', tiers: ['≥0.95 得100分', '≥0.90 得50分'] },
            { name: '近一年波动率', tiers: ['≤20% 得100分', '≤25% 得66分', '≤30% 得33分'] },
            { name: '最大回撤', tiers: ['≤20% 得100分', '≤30% 得75分', '≤40% 得50分', '≤50% 得25分'] },
        ]
    },
    [ProductTypeEnum.FixedIncome]: {
        name: '固定收益类产品评分标准',
        criteria: [
            { name: '历史收益 (年化)', tiers: ['≥4% 得100分', '≥2.5% 得66分', '≥1.5% 得33分'] },
            { name: '超额收益 (年化)', tiers: ['≥4% 得100分', '≥2% 得66分', '≥0% 得33分'] },
            { name: '业绩一致性', tiers: ['≥0.97 得100分', '≥0.92 得50分'] },
            { name: '近一年波动率', tiers: ['≤1% 得100分', '≤2% 得66分', '≤3.5% 得33分'] },
            { name: '最大回撤', tiers: ['≤2% 得100分', '≤4% 得66分', '≤8% 得33分'] },
        ]
    },
    [ProductTypeEnum.Alternative]: {
        name: '商品、衍生品、另类策略评分标准',
        criteria: [
            { name: '历史收益 (中性策略)', tiers: ['≥6% 得100分', '≥4% 得66分', '≥2% 得33分'] },
            { name: '历史收益 (其他)', tiers: ['≥12% 得100分', '≥8% 得66分', '≥4% 得33分'] },
            { name: '风险调整后收益 (夏普)', tiers: ['≥1.5 得100分', '≥1.0 得66分', '≥0.7 得33分'] },
            { name: '月度胜率', tiers: ['≥60% 得100分', '≥50% 得50分'] },
            { name: '业绩一致性', tiers: ['≥0.95 得100分', '≥0.90 得50分'] },
            { name: '最大回撤', tiers: ['≤5% 得100分', '≤15% 得66分', '≤30% 得33分'] },
        ]
    }
};

const ScoringStandardsDisplay: React.FC<{ productType: ProductType }> = ({ productType }) => {
    const standards = SCORING_STANDARDS[productType];
    if (!standards) return null;

    return (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <h4 className="font-semibold text-md mb-3">{standards.name}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {standards.criteria.map(c => (
                    <div key={c.name}>
                        <p className="font-medium text-sm text-gray-800">{c.name}</p>
                        <ul className="list-disc list-inside text-xs text-gray-600 space-y-1 mt-1">
                            {c.tiers.map(t => <li key={t}>{t}</li>)}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ScoringComparisonDisplay: React.FC<{ results: ScoringResult[] }> = ({ results }) => {
    if (!results || results.length === 0) {
        return <p className="text-gray-500 italic">尚未进行产品打分。请在“产品打分设置”中选择产品并计算得分。</p>;
    }

    const getRating = (score: number) => {
        if (score >= 80) return { text: '优秀', color: 'text-green-600' };
        if (score >= 60) return { text: '良好', color: 'text-yellow-600' };
        if (score >= 40) return { text: '一般', color: 'text-orange-500' };
        return { text: '较差', color: 'text-red-600' };
    };
    
    const getScoreColor = (score: number) => {
        return score >= 66 ? 'text-green-600 font-semibold' : score >= 33 ? 'text-yellow-600' : 'text-red-600';
    };

    const criteriaMap: Record<string, string> = {
        historicalReturn: '历史收益',
        excessReturn: '超额收益',
        monthlyWinRate: '月度胜率',
        consistency: '业绩一致性',
        volatility: '近一年波动率',
        maxDrawdown: '最大回撤',
        sharpe: '夏普比率',
    };
    
    const allCriteriaKeys = useMemo(() => {
        const keys = new Set<string>();
        results.forEach(r => Object.keys(r.scores).forEach(k => k !== 'total' && keys.add(k)));
        return Object.keys(criteriaMap).filter(k => keys.has(k));
    }, [results]);

    const productTypes = [...new Set(results.map(r => r.productType))];

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">指标</th>
                        {results.map(r => (
                            <th key={r.productName} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {r.productName}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="bg-white">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 sticky left-0 bg-white z-10">产品类型</td>
                        {results.map(r => <td key={r.productName} className="px-4 py-3 text-sm text-gray-600">{r.productType}{r.productType === ProductTypeEnum.Equity && r.isIndexEnhanced ? ' (指增)' : ''}{r.productType === ProductTypeEnum.Alternative && r.isNeutralArbitrage ? ' (中性)' : ''}</td>)}
                    </tr>
                    {allCriteriaKeys.map(key => (
                         <tr key={key} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-800 sticky left-0 bg-white hover:bg-gray-50 z-10">{criteriaMap[key]}</td>
                            {results.map(r => {
                                const score = r.scores[key];
                                const weight = r.weights[key];
                                if (score === undefined || weight === undefined) {
                                    return <td key={r.productName} className="px-4 py-3 text-sm text-gray-400">-</td>
                                }
                                const value = key === 'historicalReturn' ? r.metrics['年化收益(%)']
                                            : key === 'excessReturn' ? r.excessReturn
                                            : key === 'monthlyWinRate' ? r.monthlyWinRate
                                            : key === 'consistency' ? r.consistency
                                            : key === 'volatility' ? r.metrics['近一年波动率(%)']
                                            : key === 'maxDrawdown' ? r.metrics['最大回撤(%)']
                                            : r.sharpe;
                                 const valueUnit = key.includes('Return') || key.includes('volatility') || key.includes('Drawdown') || key.includes('Rate') ? '%' : '';
                                 const weightedScore = score * weight;
                                return (
                                    <td key={r.productName} className="px-4 py-3 text-sm text-gray-600">
                                        <div title={`权重: ${(weight*100).toFixed(0)}%`}>
                                            值: {isNaN(value) ? '-' : `${value.toFixed(2)}${valueUnit}`}<br/>
                                            <span className={getScoreColor(score)}>得分: {isNaN(score) ? '-' : score.toFixed(2)}</span><br/>
                                            加权分: {isNaN(weightedScore) ? '-' : weightedScore.toFixed(2)}
                                        </div>
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-gray-50 z-10">总分</td>
                        {results.map(r => <td key={r.productName} className="px-4 py-3 text-lg text-primary">{r.scores.total.toFixed(2)}</td>)}
</tr>
                    <tr className="bg-white">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 sticky left-0 bg-white z-10">总体评级</td>
                        {results.map(r => {
                            const rating = getRating(r.scores.total);
                            return <td key={r.productName} className={`px-4 py-3 text-sm font-bold ${rating.color}`}>{rating.text}</td>
                        })}
                    </tr>
                </tbody>
            </table>
            <div className="mt-8">
                <h3 className="text-lg font-semibold mb-4"><i className="fa fa-book text-primary mr-2"></i>打分标准详情</h3>
                {productTypes.map(type => <ScoringStandardsDisplay key={type} productType={type} />)}
            </div>
        </div>
    );
};


const TimeRangeAnalysis: React.FC<{ selectedProducts: string[]; productsData: ProductsData; timeRange: string; }> = ({ selectedProducts, productsData, timeRange }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

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

    const sortedProductNames = useMemo(() => {
        if (!timeRangeMetrics) return selectedProducts;
        let sortableItems = [...selectedProducts];
        if (sortConfig) {
            sortableItems.sort((a, b) => {
                if (sortConfig.key === 'productName') {
                    return sortConfig.direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
                }
    
                const aVal = timeRangeMetrics[a]?.[sortConfig.key as keyof Metrics];
                const bVal = timeRangeMetrics[b]?.[sortConfig.key as keyof Metrics];
    
                if (aVal == null || (typeof aVal === 'number' && isNaN(aVal))) return 1;
                if (bVal == null || (typeof bVal === 'number' && isNaN(bVal))) return -1;
    
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [selectedProducts, timeRangeMetrics, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <i className="fa fa-sort text-gray-400 ml-1"></i>;
        }
        const icon = sortConfig.direction === 'asc' ? 'fa-sort-asc' : 'fa-sort-desc';
        return <i className={`fa ${icon} text-primary ml-1`}></i>;
    };


    return (
        <>
            <div className="bg-white rounded-xl shadow-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4"><i className="fa fa-calendar text-primary mr-2"></i>时间区间分析结果</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => requestSort('productName')}>
                                    产品名称 {getSortIcon('productName')}
                                </th>
                                {TIME_RANGE_METRIC_HEADERS.map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => requestSort(h)}>{h} {getSortIcon(h)}</th>)}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {sortedProductNames.map(name => (
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
    scoringResults: ScoringResult[];
    timeRange: string;
    onExport: () => void;
    groupCorrelationTables: React.ReactNode;
}

const Results: React.FC<ResultsProps> = ({ results, productsData, selectedProducts, scoringResults, timeRange, onExport, groupCorrelationTables }) => {
    const [activeTab, setActiveTab] = useState('metrics');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const TABS = [
        { id: 'metrics', label: '指标汇总' },
        { id: 'time-range', label: '时间区间分析' },
        { id: 'scoring', label: '产品打分' },
    ];
    
    const sortedProductNames = useMemo(() => {
        if (!results) return [];
        let sortableItems = [...selectedProducts];
        if (sortConfig) {
            sortableItems.sort((a, b) => {
                if (sortConfig.key === 'productName') {
                    return sortConfig.direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
                }

                const aVal = results.metrics[a]?.[sortConfig.key as keyof Metrics];
                const bVal = results.metrics[b]?.[sortConfig.key as keyof Metrics];

                if (aVal == null || (typeof aVal === 'number' && isNaN(aVal))) return 1;
                if (bVal == null || (typeof bVal === 'number' && isNaN(bVal))) return -1;

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [selectedProducts, results, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

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
                        <MetricsTable 
                            metrics={results.metrics} 
                            productNames={sortedProductNames} 
                            onSort={requestSort}
                            sortConfig={sortConfig}
                        />
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
                    <h2 className="text-lg font-semibold mb-4"><i className="fa fa-star text-primary mr-2"></i>产品打分结果对比</h2>
                    <ScoringComparisonDisplay results={scoringResults} />
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