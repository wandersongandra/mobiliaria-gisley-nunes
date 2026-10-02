@include('partials.head')
  <body data-page="imovel">
    @include('partials.header')
    <main id="conteudo">
      <div id="property-root" class="shell property-page"></div>
      <section class="contact-section" id="contato" aria-labelledby="contact-title">
        <div class="shell contact-grid">
          <div><p class="eyebrow">interesse neste imóvel</p><h2 id="contact-title">Quer visitar<br /><em>este imóvel?</em></h2><p class="contact-copy">Envie seus dados para confirmar detalhes, disponibilidade e horário de visita.</p><div class="contact-details"><span>Atendimento em Belo Horizonte e região</span><a href="#contact-form">Enviar uma mensagem ↗</a></div></div>
          <form class="contact-form" id="contact-form"><label class="contact-honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off" /></label><div class="form-row"><label>Seu nome<input required name="name" autocomplete="name" maxlength="120" placeholder="Seu nome" /></label><label>Seu e-mail<input required type="email" name="email" autocomplete="email" maxlength="255" placeholder="voce@email.com" /></label></div><label>Como podemos ajudar?<select name="interest"><option>Quero comprar um imóvel</option><option>Quero alugar um imóvel</option><option>Quero anunciar meu imóvel</option><option>Tenho outra dúvida</option></select></label><label>Mensagem<textarea required name="message" rows="3" maxlength="3000" placeholder="Conte o que você procura"></textarea></label><button class="button button-primary" type="submit">Enviar mensagem <span aria-hidden="true">↗</span></button><p class="form-privacy">Ao enviar, seus dados serão usados para responder ao contato e registrados no CRM. <a href="/privacidade">Veja a política de privacidade.</a></p><p class="form-status" id="form-status" role="status"></p></form>
        </div>
      </section>
    </main>
    @include('partials.footer')
    <script nonce="{{ cspNonce }}" id="property-data" type="application/json">{!! $propertyJson !!}</script>
    <script type="module" src="{{ $assets['js'] }}"></script>
  </body>
</html>
