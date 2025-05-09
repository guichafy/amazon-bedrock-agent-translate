// Variáveis globais
let currentTargetLanguage = localStorage.getItem('targetLanguage') || 'en';
let isTranslating = false;
let pageTranslated = false;
let targetLanguageSelect;
let translationButton;

// Configurações
const ATTRS_TO_TRANSLATE = ['alt', 'title', 'placeholder', 'aria-label'];
const EXCLUDE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEMPLATE', 'SVG'
]);

// Utilitários
const isEligibleText = (txt) => {
  return !!txt && /\p{L}/u.test(txt) && txt.trim().length > 1; // contém letra e >1 char
};

const isVisible = (node) => {
  if (!(node instanceof HTMLElement)) return true;
  const style = getComputedStyle(node);
  return style && style.display !== 'none' && style.visibility !== 'hidden';
};

// Caminha pelo DOM e coleta textos + mapa de refs
function collectTranslatable() {
  console.log('Coletando elementos traduzíveis...');
  
  // Mapa para armazenar textos únicos e suas referências
  const refs = new Map();
  
  // 1. Coletar nós de texto
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          EXCLUDE_TAGS.has(parent.tagName) ||
          !isVisible(parent) ||
          !isEligibleText(node.nodeValue)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue.trim();
    if (!refs.has(text)) {
      refs.set(text, []);
    }
    refs.get(text).push({ type: 'text', node });
  }

  // 2. Coletar atributos relevantes
  ATTRS_TO_TRANSLATE.forEach(attr => {
    document.querySelectorAll(`[${attr}]`).forEach(el => {
      if (!isVisible(el)) return;
      
      const value = el.getAttribute(attr);
      if (isEligibleText(value)) {
        if (!refs.has(value)) {
          refs.set(value, []);
        }
        refs.get(value).push({ type: 'attr', node: el, attr });
      }
    });
  });

  // 3. Coletar valores de opções em selects
  document.querySelectorAll('option').forEach(option => {
    const text = option.textContent.trim();
    if (isEligibleText(text)) {
      if (!refs.has(text)) {
        refs.set(text, []);
      }
      refs.get(text).push({ type: 'option', node: option });
    }
  });

  return refs;
}

// Traduz os elementos coletados
async function translatePage() {
  if (isTranslating || pageTranslated) return;
  
  try {
    isTranslating = true;
    showPageLoader();
    
    // 1. Coletar todos os textos traduzíveis
    const refs = collectTranslatable();
    const uniqueTexts = Array.from(refs.keys());
    
    console.log(`Coletados ${uniqueTexts.length} textos únicos para tradução`);
    
    if (uniqueTexts.length === 0) {
      console.log('Nenhum texto encontrado para tradução');
      hidePageLoader();
      isTranslating = false;
      return;
    }
    
    // 2. Dividir em lotes de no máximo 50 textos por solicitação
    const BATCH_SIZE = 50;
    const batches = [];
    
    for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
      batches.push(uniqueTexts.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Dividido em ${batches.length} lotes para tradução`);
    
    // 3. Traduzir cada lote
    const allTranslations = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Traduzindo lote ${i+1}/${batches.length} (${batch.length} textos)...`);
      
      try {
        const translations = await translateBatch(batch, currentTargetLanguage);
        allTranslations.push(...translations);
      } catch (error) {
        console.error(`Erro ao traduzir lote ${i+1}:`, error);
      }
    }
    
    // 4. Aplicar as traduções no DOM
    console.log('Aplicando traduções no DOM...');
    
    uniqueTexts.forEach((original, idx) => {
      const translated = allTranslations[idx];
      
      if (!translated) {
        console.warn(`Nenhuma tradução recebida para: "${original}"`);
        return;
      }
      
      // Aplicar a tradução em todos os lugares onde o texto original aparece
      (refs.get(original) || []).forEach(ref => {
        try {
          if (ref.type === 'text') {
            // Manter a mesma formatação e espaços do original
            const originalValue = ref.node.nodeValue;
            const trimmedOriginal = original.trim();
            
            // Substituir apenas a parte que corresponde ao texto original
            ref.node.nodeValue = originalValue.replace(
              new RegExp(escapeRegExp(trimmedOriginal), 'g'), 
              translated
            );
          } else if (ref.type === 'attr' && ref.attr) {
            ref.node.setAttribute(ref.attr, translated);
          } else if (ref.type === 'option') {
            ref.node.textContent = translated;
          }
        } catch (err) {
          console.error(`Erro ao aplicar tradução para "${original}":`, err);
        }
      });
    });
    
    // 5. Atualizar estado da página
    pageTranslated = true;
    updateTranslateButtonLabel();
    
  } catch (error) {
    console.error('Erro ao traduzir página:', error);
  } finally {
    hidePageLoader();
    isTranslating = false;
  }
}

// Traduz um lote de textos
async function translateBatch(texts, targetLang) {
  const API_URL = 'http://127.0.0.1:3000/translate';
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: texts,
      target_language: targetLang
    })
  });
  
  if (!response.ok) {
    throw new Error(`Erro na requisição: ${response.status}`);
  }
  
  const data = await response.json();
  return data.translations || [];
}

// Compatibilidade com a interface antiga - traduz um único texto
async function translateText(text, targetLang) {
  const API_URL = 'http://127.0.0.1:3000/translate';
  
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      target_language: targetLang
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Erro na requisição');
    }
    return response.json();
  })
  .then(data => {
    console.log('Tradução recebida:', data);
    return data.translation || data.translated_text || text;
  })
  .catch(error => {
    console.error('Erro ao traduzir:', error);
    throw error;
  });
}

// Utilitário para escapar caracteres especiais em regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mostra um loader no centro da página
function showPageLoader() {
  const loaderContainer = document.createElement('div');
  loaderContainer.id = 'page-loader';
  loaderContainer.innerHTML = `
    <div class="page-loader-content">
      <div class="spinner"></div>
      <p>Traduzindo página...</p>
    </div>
  `;
  document.body.appendChild(loaderContainer);
}

// Remove o loader da página
function hidePageLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.remove();
  }
}

// Atualiza o texto do botão de tradução
function updateTranslateButtonLabel() {
  if (!translationButton) return;
  
  const button = translationButton.querySelector('button');
  if (!button) return;
  
  if (pageTranslated) {
    button.innerHTML = '<span class="icon">🔄</span> Original';
  } else {
    button.innerHTML = '<span class="icon">🌎</span> Translate';
  }
}

// Reverte a tradução recarregando a página
function revertTranslation() {
  if (!pageTranslated) return;
  
  // A maneira mais simples de reverter todas as mudanças é recarregar a página
  window.location.reload();
}

// Inicialização
function init() {
  console.log('Inicializando a aplicação de tradução...');
  targetLanguageSelect = document.getElementById('target-language');
  translationButton = document.getElementById('translation-button');
  
  if (!targetLanguageSelect || !translationButton) {
    console.error('Elementos da interface não encontrados!');
    return;
  }
  
  targetLanguageSelect.value = currentTargetLanguage;
  
  // Atualiza idioma ao mudar select no topo
  targetLanguageSelect.addEventListener('change', (e) => {
    currentTargetLanguage = e.target.value;
    localStorage.setItem('targetLanguage', currentTargetLanguage);
    
    if (pageTranslated) {
      revertTranslation();
    }
  });

  // Mostra permanentemente o botão de tradução
  translationButton.classList.remove('hidden');
  
  // Configura o botão para traduzir a página
  translationButton.querySelector('button').addEventListener('click', () => {
    if (pageTranslated) {
      revertTranslation();
    } else {
      translatePage();
    }
  });
}

// Adicionar CSS para o loader de página
function addPageLoaderStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    #page-loader {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    
    .page-loader-content {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    #translation-button {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 1000;
    }
  `;
  document.head.appendChild(styleElement);
}

// Inicializar a aplicação
document.addEventListener('DOMContentLoaded', () => {
  init();
  addPageLoaderStyles();
});