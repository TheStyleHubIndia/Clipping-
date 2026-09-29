import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import RankReelStudio from './RankReelStudio.tsx';
import './index.css';

const isRankStudio = window.location.pathname === '/rankreel' || new URLSearchParams(window.location.search).has('rankstudio');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRankStudio ? <RankReelStudio /> : <App />}
  </StrictMode>,
);