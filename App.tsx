
import React, { useState, useCallback, useMemo } from 'react';
import type { ProductsData, ProductDataPoint, Group, AnalysisResults, ScoringResult, ToastMessage, ProductType, AllMetrics, CorrelationMatrix } from './types';
import { parseExcelFile, calculateMetrics, analyzeCorrelation, findClosestValue, calculateScores, calculateMonthlyWinRate } from './utils';
import { ProductType as ProductTypeEnum } from './types';
//-FIX: Import METRIC_HEADERS to be used in the export function.
import { METRIC_HEADERS } from './constants';
import Header from './components/Header';
import Results from './components/Results';
import { LoadingSpinner, Toast, GroupModal } from './components/common';

const App: React.FC = () => {
    const [productsData, setProductsData] = useState<ProductsData>({});
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [benchmarkData, setBenchmarkData] = useState<ProductDataPoint[] | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
    const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    
    // Setup State
    const [groupNameInput, setGroupNameInput] = useState('');
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [timeRange, setTimeRange] = useState('all');

    // Scoring State
    const [scoringProduct, setScoringProduct] = useState('');
    const [strategyProducts, setStrategyProducts] = useState<string[]>([]);
    const [productType, setProductType] = useState<ProductType | ''>('');
    const [isNeutralArbitrage, setIsNeutralArbitrage] = useState(false);
    const [isIndexEnhanced, setIsIndexEnhanced] = useState(false);
    const [benchmarkFileName, setBenchmarkFileName] = useState('');

    const productNames = Object.keys(productsData);

    const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const handleFiles = useCallback(async (files: FileList) => {
        for (const file of Array.from(files)) {
            if (!/\.(xlsx|xls)$/i.test(file.name)) {
                addToast('请上传 Excel 文件 (.xlsx/.xls)', 'danger');
                continue;
            }
            try {
                const parsedData = await parseExcelFile(file);
                const name = file.name.replace(/\.(xlsx|xls)$/i, '');
                setProductsData(prev => ({ ...prev, [name]: parsedData }));
                setSelectedProducts(prev => [...prev, name]);
                addToast(`成功上传 ${name} (${parsedData.length} 条)`, 'success');
            } catch (err: any) {
                addToast(`解析 ${file.name} 失败: ${err.message}`, 'danger');
            }
        }
    }, [addToast]);
    
    const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
        if (e.dataTransfer.files?.length) {
            handleFiles(e.dataTransfer.files);
        }
    }, [handleFiles]);
    
    const removeProduct = useCallback((name: string) => {
        setProductsData(prev => {
            const next = { ...prev };
            delete next[name];
            return next;
        });
        setSelectedProducts(prev => prev.filter(p => p !== name));
        setGroups(prev => prev.map(g => ({ ...g, products: g.products.filter(p => p !== name) })).filter(g => g.products.length > 0));
        addToast(`已移除 ${name}`, 'info');
    }, [addToast]);

    const handleClear = () => {
        setProductsData({});
        setSelectedProducts([]);
        setGroups([]);
        setBenchmarkData(null);
        setAnalysisResults(null);
        setScoringResult(null);
        setScoringProduct('');
        setStrategyProducts([]);
        setProductType('');
        setIsNeutralArbitrage(false);
        setIsIndexEnhanced(false);
        setBenchmarkFileName('');
        addToast('已清空');
    };

    const handleAnalyze = useCallback(() => {
        if (selectedProducts.length === 0) {
            addToast('请至少选择一个产品', 'warning');
            return;
        }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const metrics: AllMetrics = {};
                selectedProducts.forEach(name => {
                    metrics[name] = calculateMetrics(productsData[name]);
                });
                const correlation = selectedProducts.length >= 2 ? analyzeCorrelation(selectedProducts, productsData) : null;
                setAnalysisResults({ metrics, correlation });
            } catch (e: any) {
                addToast(`分析出错: ${e.message}`, 'danger');
            } finally {
                setIsLoading(false);
            }
        }, 100);
    }, [selectedProducts, productsData, addToast]);

    const handleGroupConfirm = useCallback((selectedForGroup: string[]) => {
        if (!groupNameInput) {
            addToast('请输入分组名称', 'warning');
            return;
        }
        if (selectedForGroup.length === 0) {
            addToast('请至少选择一个产品', 'warning');
            return;
        }
        setGroups(prev => [...prev, { name: groupNameInput, products: selectedForGroup }]);
        setGroupNameInput('');
        setIsGroupModalOpen(false);
    }, [groupNameInput, addToast]);
    
    const handleBenchmarkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await parseExcelFile(file);
            setBenchmarkData(data);
            setBenchmarkFileName(file.name);
            addToast('基准数据上传成功', 'success');
        } catch (err: any) {
            addToast(`解析基准文件失败: ${err.message}`, 'danger');
        }
    };
    
    const handleScore = () => {
        if (!scoringProduct || !productType || !benchmarkData) {
            addToast('请选择产品、产品类型并上传基准数据', 'warning');
            return;
        }
        setIsLoading(true);
        setTimeout(() => {
            try {
                const productData = productsData[scoringProduct];
                const metrics = calculateMetrics(productData);
                if (!metrics) throw new Error("无法计算产品指标");

                const productStartDate = productData[0].date;
                const productEndDate = productData[productData.length-1].date;
                const productDays = (productEndDate.getTime() - productStartDate.getTime()) / (1000 * 3600 * 24);
                const productYears = productDays / 365;

                const productAnnualReturn = metrics['年化收益(%)'];
                
                const benchmarkStartValue = findClosestValue(benchmarkData, productStartDate);
                const benchmarkEndValue = findClosestValue(benchmarkData, productEndDate);

                const benchmarkTotalReturn = (benchmarkEndValue / benchmarkStartValue - 1);
                const benchmarkAnnualReturn = productDays >= 7 ? (Math.pow(1 + benchmarkTotalReturn, 1/productYears) - 1) * 100 : NaN;

                const excessReturn = productAnnualReturn - benchmarkAnnualReturn;

                const validStrategyProducts = strategyProducts.filter(name => name !== scoringProduct && productsData[name]);
                let consistency = NaN;
                if (validStrategyProducts.length > 0) {
                    const correlations = validStrategyProducts.map(sName => analyzeCorrelation([scoringProduct, sName], productsData)?.[scoringProduct]?.[sName] ?? NaN).filter(c => !isNaN(c));
                    if (correlations.length > 0) {
                       consistency = correlations.reduce((a, b) => a + b, 0) / correlations.length;
                    }
                }
                
                const monthlyWinRate = calculateMonthlyWinRate(productData, benchmarkData);
                
                const { scores, weights } = calculateScores(productType, metrics, excessReturn, consistency, monthlyWinRate, isNeutralArbitrage, isIndexEnhanced);
                
                setScoringResult({ 
                    productName: scoringProduct, 
                    metrics, 
                    excessReturn, 
                    consistency, 
                    monthlyWinRate, 
                    sharpe: metrics['夏普比率'], 
                    scores, 
                    weights, 
                    productType, 
                    isNeutralArbitrage, 
                    isIndexEnhanced 
                });
                addToast('打分完成', 'success');

            } catch (err: any) {
                 addToast(`打分出错: ${err.message}`, 'danger');
            } finally {
                setIsLoading(false);
            }
        }, 100);
    };

    const handleExport = () => {
        if (!analysisResults) {
            addToast('没有可导出的结果', 'warning');
            return;
        }
        const lines: string[] = [];
        lines.push('基本指标汇总');
        lines.push(['产品名称', ...METRIC_HEADERS].join(','));
        selectedProducts.forEach(name => {
            const metrics = analysisResults.metrics[name];
            const row = [name, ...METRIC_HEADERS.map(h => metrics?.[h as keyof typeof metrics] ?? '')];
            lines.push(row.join(','));
        });
        
        // Add more export logic for time-range and scoring if needed
        
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `净值分析结果_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        addToast('导出成功', 'success');
    };

    const groupCorrelationTables = useMemo(() => {
        return groups.map(group => {
            if (group.products.length < 2) return null;
            const correlation = analyzeCorrelation(group.products, productsData);
            if (!correlation) return null;
            return (
                <div key={group.name} className="bg-white rounded-xl shadow-card p-6 mb-8">
                    <h2 className="text-lg font-semibold mb-4"><i className="fa fa-exchange text-primary mr-2"></i>分组相关性: {group.name}</h2>
                    {/* Render correlation table for group */}
                </div>
            );
        }).filter(Boolean);
    }, [groups, productsData]);


    return (
        <>
            <Header />
            <main className="container mx-auto px-4 py-8">
                {/* --- Setup Section --- */}
                <section className="mb-8">
                    <div className="bg-white rounded-xl shadow-card p-6">
                        <h2 className="text-lg font-semibold mb-4"><i className="fa fa-upload text-primary mr-2"></i>上传净值数据</h2>
                        <div
                            id="dropZone"
                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                            onDragLeave={e => e.currentTarget.classList.remove('border-primary', 'bg-primary/5')}
                            onDrop={handleFileDrop}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-all-300 cursor-pointer"
                        >
                            <i className="fa fa-file-excel-o text-4xl text-gray-400 mb-3"></i>
                            <p className="mb-2">拖放 Excel 到此处，或</p>
                            <label className="inline-block bg-primary text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-primary/90 transition-all-300">
                                <i className="fa fa-folder-open mr-1"></i>选择文件
                                <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
                            </label>
                            <div className="text-xs text-gray-500 mt-3">解析规则：仅读取前两列（日期、净值），丢弃无效行后按日期升序处理。</div>
                        </div>
                        {productNames.length > 0 && (
                            <div className="mt-6">
                                <h3 className="font-medium mb-2">已上传产品：</h3>
                                <div className="flex flex-wrap gap-2">
                                    {productNames.map(name => (
                                        <div key={name} className="bg-neutral px-3 py-1 rounded-full text-sm flex items-center">
                                            <span>{name}</span>
                                            <button onClick={() => removeProduct(name)} className="ml-2 text-gray-500 hover:text-danger"><i className="fa fa-times"></i></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {productNames.length > 0 && (
                    <>
                        {/* --- Analysis Settings --- */}
                        <section className="mb-8">
                            <div className="bg-white rounded-xl shadow-card p-6">
                                 <h2 className="text-lg font-semibold mb-4"><i className="fa fa-cog text-primary mr-2"></i>分析设置</h2>
                                <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">选择用于计算（可多选；选择≥2个将显示相关性矩阵）</label>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                                    {productNames.map(name => (
                                        <div key={name} className="flex items-center">
                                            <input type="checkbox" id={`p-${name}`} value={name} checked={selectedProducts.includes(name)} onChange={() => setSelectedProducts(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])} className="h-4 w-4 text-primary border-gray-300 rounded"/>
                                            <label htmlFor={`p-${name}`} className="ml-2 text-sm text-gray-700">{name}</label>
                                        </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">分组设置</label>
                                  <div className="flex items-center gap-2 mb-2">
                                    <input type="text" value={groupNameInput} onChange={e => setGroupNameInput(e.target.value)} placeholder="输入分组名称" className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"/>
                                    <button onClick={() => setIsGroupModalOpen(true)} className="bg-primary text-white px-3 py-2 rounded-md text-sm hover:bg-primary/90">添加分组</button>
                                  </div>
                                   <div className="space-y-2 mt-2">
                                      {groups.map((group, index) => (
                                        <div key={index} className="bg-gray-50 p-3 rounded-md">
                                            <div className="flex justify-between items-center mb-2">
                                              <span className="font-medium">{group.name}</span>
                                              <button onClick={() => setGroups(g => g.filter((_, i) => i !== index))} className="text-danger hover:text-danger/80"><i className="fa fa-trash"></i></button>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {group.products.map(p => <span key={p} className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">{p}</span>)}
                                            </div>
                                        </div>
                                      ))}
                                   </div>
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">时间范围选择</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['all', '5y', '3y', '1y', 'ytd', '1m'].map(r => (
                                            <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 rounded-md text-sm border ${timeRange === r ? 'tab-active bg-primary/5' : 'bg-gray-100 border-gray-300'}`}>
                                                {{all: '成立以来', '5y': '近5年', '3y': '近3年', '1y': '近1年', 'ytd': '今年以来', '1m': '近1月'}[r]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={handleClear} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">清空</button>
                                    <button onClick={handleAnalyze} disabled={selectedProducts.length === 0} className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-all-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                        <i className="fa fa-bar-chart mr-2"></i>开始分析
                                    </button>
                                </div>
                            </div>
                        </section>
                        
                        {/* --- Scoring Section --- */}
                        <section className="mb-8">
                             <div className="bg-white rounded-xl shadow-card p-6">
                                <h2 className="text-lg font-semibold mb-4"><i className="fa fa-star text-primary mr-2"></i>产品打分设置</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">1. 选择产品类型</label>
                                        <select value={productType} onChange={e => setProductType(e.target.value as ProductType | '')} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                            <option value="">-- 请选择 --</option>
                                            {Object.values(ProductTypeEnum).map(pt => <option key={pt} value={pt}>{pt}</option>)}
                                        </select>
                                        {productType === ProductTypeEnum.Equity && (
                                            <div className="mt-2 flex items-center">
                                                <input type="checkbox" id="index-enhanced" checked={isIndexEnhanced} onChange={e => setIsIndexEnhanced(e.target.checked)} className="h-4 w-4 text-primary border-gray-300 rounded"/>
                                                <label htmlFor="index-enhanced" className="ml-2 text-sm text-gray-700">是否为指数增强型产品</label>
                                            </div>
                                        )}
                                        {productType === ProductTypeEnum.Alternative && (
                                            <div className="mt-2 flex items-center">
                                                <input type="checkbox" id="neutral-arbitrage" checked={isNeutralArbitrage} onChange={e => setIsNeutralArbitrage(e.target.checked)} className="h-4 w-4 text-primary border-gray-300 rounded"/>
                                                <label htmlFor="neutral-arbitrage" className="ml-2 text-sm text-gray-700">是否为中性及套利策略</label>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">2. 选择要打分的产品</label>
                                        <select value={scoringProduct} onChange={e => setScoringProduct(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                            <option value="">-- 请选择产品 --</option>
                                            {productNames.map(name => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">3. 上传基准产品净值 (用于计算超额收益及月度胜率)</label>
                                        <input type="file" onChange={handleBenchmarkFile} accept=".xlsx,.xls" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                                        {benchmarkFileName && <div className="text-xs text-gray-500 mt-1">已加载: {benchmarkFileName}</div>}
                                    </div>
                                     <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">4. 选择同策略产品 (用于计算业绩一致性)</label>
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                                            {productNames.map(name => (
                                                <div key={name} className="flex items-center">
                                                    <input type="checkbox" id={`s-${name}`} value={name} checked={strategyProducts.includes(name)} onChange={() => setStrategyProducts(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])} className="h-4 w-4 text-primary border-gray-300 rounded"/>
                                                    <label htmlFor={`s-${name}`} className="ml-2 text-sm text-gray-700">{name}</label>
                                                </div>
                                            ))}
                                         </div>
                                    </div>
                                </div>
                                <div className="flex justify-end mt-4">
                                    <button onClick={handleScore} disabled={!scoringProduct || !productType || !benchmarkData} className="bg-secondary text-white px-6 py-2 rounded-lg hover:bg-secondary/90 transition-all-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                        <i className="fa fa-calculator mr-2"></i>计算得分
                                    </button>
                                </div>
                             </div>
                        </section>
                    </>
                )}

                {analysisResults && (
                    <Results 
                        results={analysisResults} 
                        productsData={productsData} 
                        selectedProducts={selectedProducts} 
                        scoringResult={scoringResult}
                        timeRange={timeRange}
                        onExport={handleExport}
                        groupCorrelationTables={groupCorrelationTables}
                    />
                )}
            </main>

            <footer className="bg-white border-t border-gray-200 py-6 mt-12">
                <div className="container mx-auto px-4 text-center text-gray-500 text-sm">净值序列分析工具@2025.3</div>
            </footer>
            
            <LoadingSpinner isLoading={isLoading} />
            <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-2">
                {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={(id) => setToasts(ts => ts.filter(toast => toast.id !== id))} />)}
            </div>
            <GroupModal isOpen={isGroupModalOpen} products={productNames} onConfirm={handleGroupConfirm} onCancel={() => setIsGroupModalOpen(false)} />
        </>
    );
};

export default App;