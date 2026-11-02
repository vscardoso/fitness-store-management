// Teclado no app instalado no iPhone (PWA). O pwa-postbuild.js copia este arquivo para dentro do pwa-boot.<build>.js.
// Teste: node scripts/test-pwa-keyboard.mts
//
// Medido no iPhone (2026-11-02, tela 956): com o teclado aberto a área visível (visualViewport) fica com 541, já acima
// da barra de setas, mas o html e o #root seguiam com a altura da tela inteira; o iOS rolava a página (offsetTop e scrollY
// 353 a 415) e o rodapé com o campo de texto ia para trás da barra. Ao fechar o teclado a página nem sempre voltava: a
// faixa atrás do relógio mostrava o fundo claro (header "esbranquiçado").
// Enquanto o teclado está aberto a altura do app vira a da área visível (--app-h, usada no CSS do html e do #root) e a
// página volta ao topo; fechou, a variável sai e a página volta ao topo de novo.
(function () {
  var vv = window.visualViewport;
  if (!vv) return;
  var standalone = navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (!standalone) return;   // Safari comum: barras do navegador mudam a altura; fica como estava
  var root = document.documentElement;
  var sized = false;
  function reset() {
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  }
  function update() {
    var open = screen.height - vv.height > 120;
    if (open) {
      root.style.setProperty('--app-h', Math.round(vv.height) + 'px');
      sized = true;
      // o iOS rola a página para mostrar o campo antes de a altura encolher: volta logo e de novo depois da animação
      reset();
      setTimeout(reset, 60);
      setTimeout(reset, 250);
    } else {
      if (sized) {
        root.style.removeProperty('--app-h');
        sized = false;
      }
      reset();
    }
  }
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('focusout', function () { setTimeout(update, 120); });
  update();
})();
