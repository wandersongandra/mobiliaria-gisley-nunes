# Resposta a incidentes

1. Preserve evidência: horário, request ID quando disponível, logs e IDs de
   auditoria. Não copie tokens, cookies ou segredos para tickets.
2. Para perda ou suspeita de acesso administrativo, revogue a equipe afetada ou
   execute logout global; em seguida, revogue a credencial OAuth/R2 envolvida.
3. Para exposição de mídia, mantenha o bucket R2 privado, desative qualquer
   domínio direto e confirme que `/media/*` exige foto publicada no banco.
4. Para segredo exposto, revogue no provedor, gere novo valor, atualize o
   ambiente e faça nova publicação. Remover do arquivo não substitui rotação.
5. Investigue `morada_audit_log` por ator, entidade e horário. A aplicação só
   insere e lê essa trilha; não ofereça endpoints de edição ou exclusão.
6. Registre causa, alcance, correção, validação e ações preventivas sem PII
   desnecessária.
