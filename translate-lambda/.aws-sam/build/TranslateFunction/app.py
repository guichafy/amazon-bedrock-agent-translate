import os
import json
import boto3
from typing import List, Dict, Any

cors_headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

def translate_single_text(text: str, target_language: str, bedrock, language_map: Dict[str, str]) -> str:
    """Traduz um único texto usando o Bedrock."""
    if not text or len(text.strip()) == 0:
        return ""
        
    # Preparamos o texto para evitar problemas com aspas e caracteres especiais
    clean_text = text.strip().replace('"', '\"').replace('\\', '\\\\')
    
    # Obter o nome do idioma de destino a partir do código
    target_language_name = language_map.get(target_language, "English")
    
    # Criar prompt dinâmico com base no idioma de destino
    # Incluímos instruções específicas para manter o formato e não adicionar texto extra
    prompt = f"""Translate the following text from Portuguese to {target_language_name}. 
    Keep the translation concise and preserve any formatting. 
    Don't add extra text or explanations. 
    Respond with only the translated text:

    Text: \"{clean_text}\"
    Translation:"""

    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.titan-text-lite-v1")
    
    try:
        print(f"Traduzindo: '{clean_text}' para {target_language_name}")
        response = bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps({"inputText": prompt})
        )
        result = json.loads(response["body"].read())
        
        # Extrai a tradução do campo correto
        translation = ""
        if "results" in result and len(result["results"]) > 0:
            translation = result["results"][0].get("outputText", "")
            
            # Limpar a tradução recebida
            translation = translation.strip()
            
            # Remover aspas iniciais e finais se existirem
            if translation.startswith('"') and translation.endswith('"'):
                translation = translation[1:-1]
                
            # Remover qualquer prefixo comum que o LLM possa adicionar
            prefixes_to_remove = ["Translation: ", "Translated text: ", "Here is the translation: "]
            for prefix in prefixes_to_remove:
                if translation.startswith(prefix):
                    translation = translation[len(prefix):]
                    break
            
            print(f"Tradução concluída: '{translation}'")
        else:
            print(f"Resposta não contém resultados: {result}")
            
        return translation
    except Exception as e:
        print(f"Erro ao traduzir texto: '{clean_text}', Erro: {str(e)}")
        return ""

def lambda_handler(event, context):
    # Suporte a CORS para preflight requests
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": ""
        }
    
    # Recebe texto(s) e idioma de destino do evento
    body = event.get("body")
    if isinstance(body, str):
        body = json.loads(body)
    
    # Verificar se é uma solicitação de lote ou uma única tradução
    texts = body.get("texts", [])
    single_text = body.get("text")
    target_language = body.get("target_language", "en")  # Default para inglês se não especificado
    
    # Inicializar cliente Bedrock
    region = os.environ.get("BEDROCK_REGION", "us-east-1")
    bedrock = boto3.client("bedrock-runtime", region_name=region)

    # Mapeamento de códigos de idioma para nomes completos
    language_map = {
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "pt": "Portuguese",
        "ru": "Russian",
        "ja": "Japanese",
        "zh": "Chinese"
    }
    
    # Verifica se é um processamento em lote ou individual
    if texts:
        print(f"Processando tradução em lote de {len(texts)} textos para {target_language}")
        # Processa tradução em lote
        translations = []
        total_texts = len(texts)
        
        for i, text in enumerate(texts):
            print(f"Traduzindo texto {i+1}/{total_texts}")
            if text and isinstance(text, str):
                translation = translate_single_text(text, target_language, bedrock, language_map)
                translations.append(translation)
            else:
                print(f"Texto inválido na posição {i}")
                translations.append("")
        
        print(f"Tradução em lote concluída: {len(translations)} de {total_texts} textos traduzidos")
        response_body = {"translations": translations}
                
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps(response_body)
        }
    elif single_text:
        # Compatibilidade com o modo existente de tradução única
        translation = translate_single_text(single_text, target_language, bedrock, language_map)


        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"translated_text": translation})
        }
    else:
        # Erro: nenhum texto para traduzir
        return {
            "statusCode": 400, 
            "headers": cors_headers,
            "body": json.dumps({"error": "Missing 'text' or 'texts' in request."})
        }
