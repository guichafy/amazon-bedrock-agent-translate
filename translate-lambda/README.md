# Lambda de Tradução pt-br → en-us com AWS Bedrock

## Pré-requisitos
- AWS CLI configurado
- AWS SAM CLI instalado
- Python 3.11+

## Instalação
```bash
cd translate-lambda
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Execução Local
### Invocação direta
```bash
sam local invoke TranslateFunction -e events/event.json
```

### API Local
```bash
sam local start-api
```

## Exemplo de evento (`events/event.json`)
```json
{
  "body": "{ \"text\": \"Olá, como vai você?\" }"
}
```

## Observações
- É necessário ter permissões para acessar o Bedrock.
- O modelo padrão é o `amazon.titan-text-lite-v1` (baixo custo).
- As chamadas ao Bedrock geram custos na AWS.
