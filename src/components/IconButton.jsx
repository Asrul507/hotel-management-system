import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export default function IconButton({ icon, label = '', title = '', onClick, disabled = false, variant = 'secondary', type = 'button' }) {
  const accessibleLabel = title || label;

  return (
    <button
      type={type}
      className={`icon-button ${variant || ''} ${label ? 'with-label' : 'icon-only'}`.trim()}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <FontAwesomeIcon icon={icon} aria-hidden="true" />}
      {label && <span>{label}</span>}
    </button>
  );
}
