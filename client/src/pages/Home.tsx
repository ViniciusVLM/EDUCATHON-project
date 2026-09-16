import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="hero">
      <div className="hero-badge animate-slide-down">
        🎓 Educathon 2026
      </div>

      <h1 className="animate-slide-up">
        Seu <span className="gradient-text">Copiloto Pedagógico</span> com Inteligência Artificial
      </h1>

      <p className="hero-subtitle">
        Automatize a correção de atividades dissertativas. A IA gera rascunhos de feedback
        individualizado e encorajador — você revisa, edita e aprova com total controle.
      </p>

      <div className="hero-actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate('/setup')}
          id="btn-new-correction"
        >
          ✨ Nova Correção
        </button>
        <button
          className="btn btn-secondary btn-lg"
          onClick={() => navigate('/activities')}
          id="btn-view-activities"
        >
          📋 Ver Atividades
        </button>
      </div>

      <div className="hero-features">
        <div className="card card-glow hero-feature-card stagger-1">
          <div className="hero-feature-number">01</div>
          <div className="hero-feature-title">Configure</div>
          <p className="hero-feature-desc">
            Defina a atividade, a pergunta e a rubrica do que você espera da resposta dos alunos.
          </p>
        </div>

        <div className="card card-glow hero-feature-card stagger-2">
          <div className="hero-feature-number">02</div>
          <div className="hero-feature-title">Envie</div>
          <p className="hero-feature-desc">
            Faça upload de um CSV com as respostas da turma ou digite-as manualmente.
          </p>
        </div>

        <div className="card card-glow hero-feature-card stagger-3">
          <div className="hero-feature-number">03</div>
          <div className="hero-feature-title">Revise</div>
          <p className="hero-feature-desc">
            A IA sugere feedbacks. Você edita com a sua voz, aprova e exporta para a turma.
          </p>
        </div>
      </div>
    </div>
  );
}
