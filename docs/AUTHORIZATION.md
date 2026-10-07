# Autorização

Autenticação administrativa depende da sessão Laravel e da linha revogável em
`morada_admin_sessions`. A autorização é deny-by-default por
`RequireAdmin` + `RequireCapability`; o frontend não concede permissão.

| Capability | manager | editor |
| --- | :---: | :---: |
| property.read / property.write | sim | sim, somente rascunhos |
| property.publish / property.archive | sim | não |
| media.manage | sim | somente imóveis em rascunho |
| site.read | sim | sim |
| site.manage / testimonial.manage | sim | não |
| lead.read / lead.status | sim | sim |
| lead.erase / audit.read / team.manage | sim | não |

O papel bootstrap vem de `GISELY_ADMIN_OPEN_IDS`; qualquer outra identidade
exige convite ou vínculo validado pelo OAuth. Alterar, remover ou desativar um
membro revoga suas sessões. Não adicionar checks de papel em controllers sem
antes criar ou reutilizar uma capability em `AdminAccessService`.
