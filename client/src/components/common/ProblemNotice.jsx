import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { apiError } from '../../services/api';
import { explainProblem } from '../../utils/problems';

// The site's one message for anything refused or failed (AYK-219): a raised 3D card with what
// happened, why, and the way out, with a button straight to it. `error` is an API error or a
// translated message; `handlers` answers actions such as { retry, choose_both }.
export default function ProblemNotice({ error, handlers = {}, className = '', onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const problem = explainProblem(error, t);
  if (!problem) return null;
  const reason = problem.reason || (typeof error === 'object' ? apiError(error) : '');
  const actions = problem.actions.filter(action => action.to || handlers[action.handler]);

  const run = async action => {
    if (action.handler) { handlers[action.handler](); return; }
    if (action.signOut) await logout();
    onClose?.();
    navigate(action.to);
  };

  return (
    <div role="alert" className={`problem-3d problem-3d--${problem.tone} ${className}`} data-testid="problem-notice">
      <div className="problem-3d__head">
        <span className="problem-3d__icon" aria-hidden="true">{problem.icon}</span>
        <strong className="problem-3d__title">{problem.title}</strong>
        {onClose && <button type="button" className="problem-3d__close" aria-label={t('common.close')} onClick={onClose}>✕</button>}
      </div>
      {reason && <p className="problem-3d__line"><b>{t('problem.why')}:</b> {reason}</p>}
      {problem.fix && <p className="problem-3d__line"><b>{t('problem.fix')}:</b> {problem.fix}</p>}
      {problem.jobs?.length > 0 && (
        <ul className="problem-3d__jobs">
          {problem.jobs.map(job => <li key={job.id}><Link to={`/requests/${job.id}`}>{job.title || `#${job.id}`}</Link></li>)}
        </ul>
      )}
      {actions.length > 0 && (
        <div className="problem-3d__actions">
          {actions.map((action, index) => (
            <button key={action.label} type="button" onClick={() => run(action)}
              className={`problem-3d__btn ${index === 0 ? 'problem-3d__btn--main' : ''}`} data-testid="problem-action">
              {action.label} {index === 0 ? '←' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
