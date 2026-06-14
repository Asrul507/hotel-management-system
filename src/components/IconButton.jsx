import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export default function IconButton({
  icon,
  label = '',
  children,
  title = '',
  onClick,
  disabled = false,
  variant = 'secondary',
  type = 'button',
  className = '',
  ...rest
}) {
  const content = children || label;
  const accessibleLabel = title || (typeof content === 'string' ? content : 'Action');

  return (
    <button
      type={type}
      className={`icon-button ${variant || ''} ${content ? 'with-label' : 'icon-only'} ${className}`.trim()}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon && <FontAwesomeIcon icon={icon} aria-hidden="true" />}
      {content && <span>{content}</span>}
    </button>
  );
}
