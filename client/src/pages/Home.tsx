import { useNavigate } from 'react-router-dom';
import { Mascot } from '../components/ui/Mascot';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="hero">
      <Mascot size={150} className="home-mascot" />
      <div className="hero-badge animate-slide-down">
        Educathon 2026
      </div>

      <h1 className="animate-slide-up">
        Seu <span className="gradient-text">Copiloto Pedagógico</span> com Inteligência Artificial
      </h1>

      <p className="hero-subtitle">
        Corrija atividades dissertativas e de múltipla escolha. A IA gera rascunhos de feedback
        individualizado e encorajador — você revisa, edita, lança a nota e aprova com total controle.
      </p>

      <div className="hero-actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate('/setup')}
          id="btn-new-correction"
        >
          Nova correção
        </button>
        <button
          className="btn btn-secondary btn-lg"
          onClick={() => navigate('/activities')}
          id="btn-view-activities"
        >
          Ver atividades
        </button>
      </div>
      <p className="hero-student-link">
        É aluno? <button type="button" className="link-btn" onClick={() => navigate('/aluno/entrar')} id="btn-student-portal">Entrar no portal do aluno</button>
      </p>

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
