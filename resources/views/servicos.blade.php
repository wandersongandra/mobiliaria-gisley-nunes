@include('partials.head')
  <body data-page="servicos">
    @include('partials.header')
    <main id="conteudo">
      <section class="page-hero shell services-hero">
        <div>
          <p class="eyebrow"><span class="eyebrow-dot"></span> serviços imobiliários</p>
          <h1>Comprar, alugar<br /><em>ou anunciar em Belo Horizonte.</em></h1>
        </div>
        <p class="page-lead">Escolha uma opção e fale com a equipe Gisley Nunes em {{ $site['area'] }}.</p>
      </section>

      <section class="services-intro shell" aria-labelledby="services-title">
        <div class="services-intro-index">01</div>
        <div><p class="eyebrow">o que você precisa?</p><h2 id="services-title">Escolha uma opção<br /><em>e fale com a equipe.</em></h2></div>
        <p>Consulte os imóveis disponíveis, fale sobre locação ou envie os dados do seu imóvel para anunciar.</p>
      </section>

      <section class="services-list shell" aria-label="Serviços imobiliários">
        <article class="service-story service-story-dark"><span class="service-number">01</span><div><p class="eyebrow eyebrow-light">comprar</p><h2>Comprar um imóvel<br /><em>em Belo Horizonte.</em></h2><p>Consulte os imóveis, use os filtros e envie uma mensagem quando quiser conhecer uma opção.</p><a class="button button-light" href="/imoveis">Ver imóveis <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">comprar</span></article>
        <article class="service-story service-story-warm"><span class="service-number">02</span><div><p class="eyebrow">alugar</p><h2>Alugar um imóvel<br /><em>em Belo Horizonte.</em></h2><p>Veja as opções para locação e fale com a equipe para confirmar valores e disponibilidade.</p><a class="button button-primary" href="/imoveis?purpose=Alugar">Ver imóveis para alugar <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">alugar</span></article>
        <article class="service-story service-story-paper"><span class="service-number">03</span><div><p class="eyebrow">anunciar</p><h2>Anunciar um imóvel<br /><em>com a equipe.</em></h2><p>Envie as informações básicas da propriedade e converse sobre cadastro, fotos e divulgação.</p><a class="button button-primary" href="/contato">Anunciar meu imóvel <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">anunciar</span></article>
      </section>

      <section class="service-steps shell" aria-labelledby="service-steps-title">
        <div><p class="eyebrow">como funciona</p><h2 id="service-steps-title">Três etapas<br /><em>para começar.</em></h2></div>
        <ol><li><span>01</span><div><strong>Você envia os dados</strong><p>Conte a localização, o tipo de imóvel e o que procura.</p></div></li><li><span>02</span><div><strong>A equipe responde</strong><p>Conferimos as opções e tiramos suas dúvidas.</p></div></li><li><span>03</span><div><strong>Você escolhe como seguir</strong><p>Agendamos uma visita ou seguimos com o anúncio.</p></div></li></ol>
      </section>

      <section class="services-intro shell" aria-labelledby="technical-services-title">
        <div class="services-intro-index">02</div>
        <div><p class="eyebrow">análise e documentação</p><h2 id="technical-services-title">Avaliações e laudos<br /><em>para diferentes demandas.</em></h2></div>
        <p>Além da intermediação imobiliária, a equipe recebe solicitações relacionadas a avaliações de imóveis, perícia judicial e laudos técnicos para imóveis rurais e urbanos.</p>
      </section>

      <section class="services-list shell" aria-label="Serviços de avaliação e documentação">
        <article class="service-story service-story-paper"><span class="service-number">04</span><div><p class="eyebrow">avaliação de imóveis</p><h2>Informações para<br /><em>tomar decisões.</em></h2><p>Converse sobre a finalidade da avaliação, o imóvel e a documentação disponível para orientar o próximo passo.</p><a class="button button-primary" href="/contato">Solicitar informações <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">avaliar</span></article>
        <article class="service-story service-story-dark"><span class="service-number">05</span><div><p class="eyebrow eyebrow-light">perícia e laudos</p><h2>Demandas judiciais<br /><em>e técnicas.</em></h2><p>Recebemos pedidos de perícia judicial e laudos técnicos para entender o escopo, a finalidade e os documentos necessários.</p><a class="button button-light" href="/contato">Falar sobre a demanda <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">laudos</span></article>
        <article class="service-story service-story-warm"><span class="service-number">06</span><div><p class="eyebrow">rural e urbano</p><h2>Imóveis rurais<br /><em>ou urbanos.</em></h2><p>Informe a localização e o tipo de imóvel. A equipe organiza o atendimento conforme a necessidade apresentada.</p><a class="button button-primary" href="/contato">Enviar detalhes <span aria-hidden="true">↗</span></a></div><span class="service-word" aria-hidden="true">rural</span></article>
      </section>

      <section class="service-steps shell" aria-labelledby="experience-title">
        <div><p class="eyebrow">trajetória</p><h2 id="experience-title">Experiência desde<br /><em>2023.</em></h2></div>
        <p>Atuação informada pela equipe desde 2023, com atendimento próximo e organização das informações de cada imóvel e demanda.</p>
      </section>

      <section class="contact-section service-cta" aria-labelledby="service-cta-title"><div class="shell contact-grid"><div><p class="eyebrow">fale com a equipe</p><h2 id="service-cta-title">Precisa de ajuda<br /><em>com um imóvel?</em></h2><p class="contact-copy">Envie uma mensagem com os detalhes da sua busca.</p></div><div class="service-cta-actions"><a class="button button-primary" href="/contato">Enviar uma mensagem <span aria-hidden="true">↗</span></a><a class="text-link" href="/bairros">Ver bairros</a></div></div></section>
    </main>
    @include('partials.footer')
    <script type="module" src="{{ $assets['js'] }}"></script>
  </body>
</html>
