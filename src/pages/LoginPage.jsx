import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const { error: err } = await signIn(form.email, form.password);
    if (err) return setError(err.message);
    nav('/');
  };

  return <div className="auth"><form onSubmit={submit} className="card"><h1>Hotel Management System</h1>
    <input placeholder="Email" type="email" required onChange={(e)=>setForm({...form,email:e.target.value})}/>
    <input placeholder="Password" type="password" required onChange={(e)=>setForm({...form,password:e.target.value})}/>
    {error && <p className="error">{error}</p>}<button>Login</button></form></div>;
}
