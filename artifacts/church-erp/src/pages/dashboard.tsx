import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth-context';
import { Users, DollarSign, Calendar, Target, HandHeart, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { user } = useAuth();

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const widgets = [
    { title: "Membros Ativos", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Dízimos e Ofertas", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Próximos Eventos", icon: Calendar, color: "text-violet-500", bg: "bg-violet-500/10" },
    { title: "Novos Visitantes", icon: HandHeart, color: "text-rose-500", bg: "bg-rose-500/10" },
    { title: "Metas Anuais", icon: Target, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="mb-10">
        <h2 className="text-3xl font-display font-bold text-foreground">
          Olá, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-muted-foreground mt-2 text-lg">
          Aqui está o resumo das atividades da sua igreja hoje.
        </p>
      </div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      >
        {widgets.map((widget, i) => (
          <motion.div 
            key={i} 
            variants={item}
            className="group relative bg-card rounded-2xl p-6 shadow-sm border border-border/60 hover:shadow-xl hover:border-border transition-all duration-300 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
              <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className={`w-14 h-14 rounded-2xl ${widget.bg} ${widget.color} flex items-center justify-center mb-6`}>
              <widget.icon className="w-7 h-7" />
            </div>
            
            <h3 className="text-xl font-bold text-foreground mb-1">{widget.title}</h3>
            <p className="text-muted-foreground text-sm mb-6">Módulo em desenvolvimento</p>
            
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border/50">
                Em breve
              </span>
            </div>
          </motion.div>
        ))}

        {/* Welcome Card spanning 2 columns */}
        <motion.div 
          variants={item}
          className="md:col-span-2 xl:col-span-1 bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 shadow-lg shadow-primary/20 text-white relative overflow-hidden"
        >
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-black/10 rounded-full blur-xl"></div>
          
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-bold font-display mb-2">Fundação concluída</h3>
              <p className="text-white/80 leading-relaxed">
                A estrutura base de autenticação, segurança e logs está pronta. Os módulos de negócio serão integrados aqui.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-white/20">
              <div className="flex items-center gap-4 text-sm font-medium text-white/90">
                <span className="flex items-center"><ShieldCheck className="w-4 h-4 mr-1.5"/> RLS Ativo</span>
                <span className="flex items-center"><Users className="w-4 h-4 mr-1.5"/> 3 Perfis</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
}
