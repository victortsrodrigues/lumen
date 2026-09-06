import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth-context';
import { Redirect, Link } from 'wouter';
import { useImportMembersCsv, ImportCsvRowResult } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import { Eye, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ImportMembers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [results, setResults] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    details: ImportCsvRowResult[];
  } | null>(null);

  const { mutateAsync: importCsv } = useImportMembersCsv();

  if (user?.role === 'member') {
    return <Redirect to="/" />;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'text/csv' && !selected.name.endsWith('.csv')) {
      toast({ title: "Formato inválido", description: "Por favor, selecione um arquivo CSV.", variant: "destructive" });
      return;
    }

    setFile(selected);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      
      Papa.parse(text, {
        header: true,
        preview: 5,
        skipEmptyLines: true,
        complete: (results) => {
          setPreviewData(results.data);
        }
      });
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (!csvContent) return;
    if (!lgpdAccepted) {
      toast({ title: "Atenção", description: "O aceite do termo LGPD é obrigatório para importação em massa.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      const response = await importCsv({
        data: {
          csvContent,
          lgpdConsentAccepted: lgpdAccepted
        }
      });
      
      setResults({
        total: response.total,
        succeeded: response.succeeded,
        failed: response.failed,
        details: response.results
      });
      
      toast({ 
        title: "Importação concluída", 
        description: `${response.succeeded} membros importados com sucesso.` 
      });
      
      // Clear file selection but keep results visible
      setFile(null);
      setCsvContent('');
      setPreviewData([]);
    } catch (error: any) {
      toast({
        title: "Erro na importação",
        description: error.message || "Ocorreu um erro ao processar o arquivo.",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, { label: "Importar" }]}>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Importação em Massa</h2>
          <p className="text-muted-foreground mt-1">Cadastre múltiplos membros rapidamente usando um arquivo CSV.</p>
        </div>
        <Link href="/members" className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para lista
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Upload Area */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-8 text-center">
            <div 
              className={cn(
                "border-2 border-dashed rounded-xl p-12 transition-all flex flex-col items-center justify-center",
                file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/30"
              )}
            >
              <FileSpreadsheet className={cn("w-16 h-16 mb-4", file ? "text-primary" : "text-muted-foreground")} />
              
              {file ? (
                <>
                  <h3 className="text-lg font-semibold text-foreground">{file.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-6">{(file.size / 1024).toFixed(2)} KB pronto para processamento.</p>
                  <button 
                    onClick={() => { setFile(null); setCsvContent(''); setPreviewData([]); }}
                    className="text-sm font-medium text-destructive hover:underline"
                  >
                    Remover arquivo
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Arraste seu arquivo CSV ou clique abaixo</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    O arquivo deve conter cabeçalhos na primeira linha correspondentes aos campos do sistema.
                  </p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-2.5 rounded-xl font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                  >
                    Selecionar Arquivo
                  </button>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".csv,text/csv" 
                className="hidden" 
              />
            </div>
          </div>

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="px-6 py-4 border-b border-border bg-secondary/20">
                <h3 className="font-semibold text-foreground flex items-center">
                  <Eye className="w-4 h-4 mr-2 text-primary" /> Pré-visualização (5 primeiras linhas)
                </h3>
              </div>
              <div className="overflow-x-auto p-0">
                <table className="w-full text-left text-xs font-mono whitespace-nowrap">
                  <thead className="bg-secondary/30 border-b border-border text-muted-foreground">
                    <tr>
                      {Object.keys(previewData[0]).map(key => (
                        <th key={key} className="px-4 py-3">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/10">
                        {Object.values(row as Record<string,any>).map((val, j) => (
                          <td key={j} className="px-4 py-3 text-muted-foreground">{String(val || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-in fade-in duration-500">
              <div className="p-6 border-b border-border flex items-center gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground">Relatório de Importação</h3>
                  <p className="text-sm text-muted-foreground">Total processado: {results.total} linhas</p>
                </div>
                <div className="flex gap-4">
                  <div className="text-center px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800/30">
                    <span className="block text-2xl font-bold text-green-600 dark:text-green-400">{results.succeeded}</span>
                    <span className="text-xs font-medium text-green-700 dark:text-green-500 uppercase tracking-wider">Sucesso</span>
                  </div>
                  <div className="text-center px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/30">
                    <span className="block text-2xl font-bold text-red-600 dark:text-red-400">{results.failed}</span>
                    <span className="text-xs font-medium text-red-700 dark:text-red-500 uppercase tracking-wider">Falhas</span>
                  </div>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-border">
                    {results.details.map((res, i) => (
                      <tr key={i} className={res.success ? "bg-background" : "bg-red-50/50 dark:bg-red-900/10"}>
                        <td className="px-6 py-3 w-16 text-muted-foreground font-mono text-xs">#{res.row}</td>
                        <td className="px-6 py-3">
                          {res.success ? (
                            <div className="flex items-center text-foreground">
                              <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                              <span className="font-medium">{res.fullName}</span> cadastrado.
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <div className="flex items-center text-destructive font-medium">
                                <XCircle className="w-4 h-4 mr-2 shrink-0" />
                                Falha na linha {res.row}
                              </div>
                              <span className="text-xs text-muted-foreground mt-1 ml-6">{res.error}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Right Col - Instructions & Actions */}
        <div className="space-y-6">
          <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
            <h3 className="font-semibold text-primary mb-4 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" /> Formato Esperado
            </h3>
            <p className="text-sm text-foreground/80 mb-4 leading-relaxed">
              O sistema espera a primeira linha como cabeçalho. As colunas reconhecidas são (minúsculas, sem acento):
            </p>
            <ul className="text-xs font-mono text-primary/80 space-y-2 bg-background/50 p-4 rounded-xl border border-primary/10">
              <li>fullName (Obrigatório)</li>
              <li>cpf</li>
              <li>email</li>
              <li>phone</li>
              <li>dateOfBirth (YYYY-MM-DD)</li>
              <li>sex (masculino/feminino)</li>
              <li>status (ativo/inativo)</li>
            </ul>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <div className="flex items-start gap-3 mb-6">
              <input 
                type="checkbox" 
                id="lgpd_import"
                checked={lgpdAccepted}
                onChange={(e) => setLgpdAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-primary text-primary focus:ring-primary"
              />
              <label htmlFor="lgpd_import" className="text-sm font-medium text-foreground cursor-pointer leading-snug">
                Confirmo que possuo a autorização (Termo LGPD) assinada fisicamente ou digitalmente para os membros presentes nesta lista.
              </label>
            </div>

            <button 
              onClick={handleImport}
              disabled={!file || isImporting || !lgpdAccepted}
              className="w-full flex items-center justify-center px-6 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isImporting ? (
                <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Processando Lote...</>
              ) : (
                <><Upload className="w-5 h-5 mr-2" /> Iniciar Importação</>
              )}
            </button>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
