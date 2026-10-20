/**
 * Minha conta (/conta): dados do professor e troca de senha
 * (importante para quem recebeu uma senha provisória da instituição).
 */
import { useAuth } from '../contexts/AuthContext';
import { Window } from '../components/ui/Window';
import { ChangePasswordForm } from '../components/auth/ChangePasswordForm';
import { changeTeacherPassword } from '../services/api';

export default function Account() {
  const { teacher } = useAuth();
  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">Minha conta</h2>
          <p className="page-subtitle">
            {teacher?.name} · {teacher?.email}
            {teacher?.organization ? ` · ${teacher.organization.name}` : ''}
          </p>
        </div>
      </div>
      <Window fileName="trocar-senha.txt">
        <ChangePasswordForm idPrefix="teacher-pass" onSubmit={changeTeacherPassword} />
      </Window>
    </div>
  );
}
