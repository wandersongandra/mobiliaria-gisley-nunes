# Autorização

Autenticação administrativa depende da sessão Laravel e da linha revogável em
`morada_admin_sessions`. A autorização é deny-by-default por
`RequireAdmin` + `RequireCapability`; o frontend não concede permissão.

| Capability | manager | editor |
| --- | :---: | :---: |
| property.read / property.write | sim | sim, somente rascunhos próprios cadastrados pelo corretor |
| property.publish / property.archive | sim | não |
| media.manage | sim | somente imóveis próprios em rascunho |
| site.read | sim | sim |
| site.manage / testimonial.manage | sim | não |
| lead.read / lead.status / lead.history | sim | sim |
| form.manage / lead.erase / audit.read / team.manage | sim | não |

O cadastro pessoal do corretor (`GET/PUT /api/admin/profile`) é restrito à
sessão autenticada do próprio usuário. O endereço e a data de nascimento não
são exibidos na lista da equipe.

Imóveis antigos sem `created_by_open_id` ficam editáveis somente por gestores.
Essa decisão é fail-closed até que o gestor os revise e, se necessário,
recrie o cadastro com o proprietário correto.

O papel bootstrap vem de `GISELY_ADMIN_OPEN_IDS`; qualquer outra identidade
exige convite ou vínculo validado pelo OAuth. Alterar, remover ou desativar um
membro revoga suas sessões. Não adicionar checks de papel em controllers sem
antes criar ou reutilizar uma capability em `AdminAccessService`.
