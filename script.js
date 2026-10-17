/**
 * Master Auto Service Caicó - Arquitetura Core v5.0
 * Padrão: Event-Driven, Finite State Machine & Haptic UX
 */

(() => {
    'use strict';

    // ==========================================
    // 1. CONFIGURAÇÕES & CONSTANTES
    // ==========================================
    const CONFIG = Object.freeze({
        instagramUrl: 'https://www.instagram.com/masterautoservicecaico/',
        headerOffset: 80,
        scrollThreshold: 40,
        storageKey: 'master_auto_draft_v2',
        analyticsPrefix: '[MasterAuto Analytics]',
        maxCharLimit: 300
    });

    // ==========================================
    // 2. SISTEMA DE TELEMETRIA & HAPTIC
    // ==========================================
    const System = {
        log(event, details = {}) {
            console.log(`${CONFIG.analyticsPrefix} [${event}]`, details);
        },

        vibrate(pattern = [30]) {
            if ('vibrate' in navigator) {
                try { navigator.vibrate(pattern); } catch (e) {}
            }
        },

        async copyText(text) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                document.body.appendChild(textArea);
                textArea.select();
                const result = document.execCommand('copy');
                textArea.remove();
                return result;
            } catch (err) {
                return false;
            }
        }
    };

    // ==========================================
    // 3. BARRAMENTO DE EVENTOS (EVENT BUS)
    // ==========================================
    class EventBus {
        constructor() {
            this.events = {};
        }
        on(event, listener) {
            if (!this.events[event]) this.events[event] = [];
            this.events[event].push(listener);
        }
        emit(event, data) {
            if (this.events[event]) {
                this.events[event].forEach(listener => listener(data));
            }
        }
    }
    const bus = new EventBus();

    // ==========================================
    // 4. SISTEMA DE NOTIFICAÇÕES (UI TOAST)
    // ==========================================
    const Toast = {
        show(message, type = 'info') {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `toast-item toast-${type}`;
            toast.setAttribute('role', 'alert');
            toast.innerHTML = `<span>${message}</span>`;
            
            container.appendChild(toast);
            System.vibrate(type === 'error' ? [50, 50, 50] : [25]);

            requestAnimationFrame(() => toast.classList.add('show'));

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3800);
        }
    };

    // ==========================================
    // 5. MÁQUINA DE ESTADOS DO FORMULÁRIO (FSM)
    // ==========================================
    class FormStateMachine {
        constructor(formElement) {
            this.form = formElement;
            this.state = 'IDLE'; // IDLE, VALIDATING, SUBMITTING, SUCCESS
            this.fields = {
                nome: formElement.querySelector('input[placeholder*="Nome"]'),
                telefone: formElement.querySelector('input[type="tel"]'),
                veiculo: formElement.querySelector('input[placeholder*="Veículo"]'),
                mensagem: document.getElementById('campo-mensagem') || formElement.querySelector('textarea')
            };
            
            this.init();
        }

        init() {
            this.bindMasks();
            this.bindAutoSave();
            this.setupCharCounter();
            this.loadDraft();
        }

        setState(newState) {
            this.state = newState;
            System.log('FormStateChange', { state: this.state });
            bus.emit('form:stateChange', this.state);
        }

        bindMasks() {
            if (this.fields.telefone) {
                this.fields.telefone.addEventListener('input', (e) => {
                    let numbers = e.target.value.replace(/\D/g, '').slice(0, 11);
                    if (!numbers) e.target.value = '';
                    else if (numbers.length <= 2) e.target.value = `(${numbers}`;
                    else if (numbers.length <= 7) e.target.value = `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
                    else e.target.value = `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
                });
            }
        }

        // LÓGICA DO CONTADOR E LIMITE DE CARACTERES
        setupCharCounter() {
            const textarea = document.getElementById('campo-mensagem') || this.fields.mensagem;
            const counter = document.getElementById('char-counter');

            if (!textarea) return;

            // Define o limite nativo de 300 caracteres no atributo do elemento
            textarea.setAttribute('maxlength', CONFIG.maxCharLimit);

            const atualizar = () => {
                const total = textarea.value.length;
                if (counter) {
                    counter.textContent = `${total}/${CONFIG.maxCharLimit}`;
                    if (total >= CONFIG.maxCharLimit) {
                        counter.classList.add('limit-reached');
                    } else {
                        counter.classList.remove('limit-reached');
                    }
                }
            };

            // Escuta input, digitação, colagem (paste) e mudanças
            ['input', 'keyup', 'paste', 'change'].forEach(evt => {
                textarea.addEventListener(evt, () => setTimeout(atualizar, 10));
            });

            atualizar();
        }

        bindAutoSave() {
            const saveHandler = () => {
                const data = {
                    nome: this.fields.nome?.value || '',
                    telefone: this.fields.telefone?.value || '',
                    veiculo: this.fields.veiculo?.value || '',
                    mensagem: this.fields.mensagem?.value || ''
                };
                localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
            };

            Object.values(this.fields).forEach(field => {
                if (field) field.addEventListener('input', saveHandler);
            });
        }

        loadDraft() {
            try {
                const saved = localStorage.getItem(CONFIG.storageKey);
                if (saved) {
                    const data = JSON.parse(saved);
                    if (this.fields.nome && data.nome) this.fields.nome.value = data.nome;
                    if (this.fields.telefone && data.telefone) this.fields.telefone.value = data.telefone;
                    if (this.fields.veiculo && data.veiculo) this.fields.veiculo.value = data.veiculo;
                    if (this.fields.mensagem && data.mensagem) {
                        this.fields.mensagem.value = data.mensagem;
                        this.setupCharCounter();
                    }
                }
            } catch (e) {}
        }

        validate() {
            this.setState('VALIDATING');

            const payload = {
                nome: this.fields.nome?.value.trim(),
                telefone: this.fields.telefone?.value.trim(),
                veiculo: this.fields.veiculo?.value.trim() || 'Não informado',
                mensagem: this.fields.mensagem?.value.trim()
            };

            if (!payload.nome || payload.nome.length < 3) {
                Toast.show('⚠️ Por favor, informe seu nome completo.', 'error');
                this.fields.nome?.focus();
                this.setState('IDLE');
                return null;
            }

            if (!payload.telefone || payload.telefone.length < 14) {
                Toast.show('⚠️ Digite um WhatsApp válido com DDD.', 'error');
                this.fields.telefone?.focus();
                this.setState('IDLE');
                return null;
            }

            if (!payload.mensagem || payload.mensagem.length < 4) {
                Toast.show('⚠️ Informe qual serviço seu veículo precisa.', 'error');
                this.fields.mensagem?.focus();
                this.setState('IDLE');
                return null;
            }

            return payload;
        }
    }

    // ==========================================
    // 6. GERENCIADOR DE UI E NAVEGAÇÃO
    // ==========================================
    const UIManager = {
        init() {
            this.header = document.querySelector('.cabecalho');
            this.nav = document.querySelector('.menu-navegacao');
            this.headerContent = document.querySelector('.header-content');

            this.setupMobileMenu();
            this.setupScrollObserver();
            this.setupSmoothScroll();
            this.setupAnimations();
            this.injectStyles();
        },

        setupMobileMenu() {
            if (!this.headerContent || !this.nav) return;

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'menu-toggle';
            toggleBtn.setAttribute('aria-label', 'Abrir Menu');
            toggleBtn.innerHTML = '<i data-lucide="menu"></i>';
            this.headerContent.appendChild(toggleBtn);

            const toggle = (force) => {
                const active = force !== undefined ? force : !this.nav.classList.contains('active');
                this.nav.classList.toggle('active', active);
                toggleBtn.innerHTML = active ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
                document.body.style.overflow = active ? 'hidden' : '';
                System.vibrate([15]);
                if (window.lucide) lucide.createIcons();
            };

            toggleBtn.addEventListener('click', () => toggle());
            document.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));
            this.nav.querySelectorAll('a').forEach(l => l.addEventListener('click', () => toggle(false)));
        },

        setupScrollObserver() {
            let ticking = false;
            window.addEventListener('scroll', () => {
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        if (this.header) {
                            this.header.classList.toggle('scrolled', window.pageYOffset > CONFIG.scrollThreshold);
                        }
                        ticking = false;
                    });
                    ticking = true;
                }
            }, { passive: true });
        },

        setupSmoothScroll() {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', (e) => {
                    const id = anchor.getAttribute('href');
                    if (id === '#') return;
                    const target = document.querySelector(id);
                    if (target) {
                        e.preventDefault();
                        const targetPos = target.getBoundingClientRect().top + window.pageYOffset - CONFIG.headerOffset;
                        window.scrollTo({ top: targetPos, behavior: 'smooth' });
                    }
                });
            });
        },

        setupAnimations() {
            if (!('IntersectionObserver' in window)) return;
            const targets = document.querySelectorAll('.card-servico, .card-diferencial, .stat-card, .caixa-estatisticas, .info-contato, .formulario-contato');
            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('reveal-active');
                        obs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });

            targets.forEach((el, index) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(30px)';
                el.style.transition = `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${(index % 3) * 0.08}s`;
                observer.observe(el);
            });
        },

        injectStyles() {
            if (document.getElementById('core-styles')) return;
            const style = document.createElement('style');
            style.id = 'core-styles';
            style.innerHTML = `
                .reveal-active { opacity: 1 !important; transform: translateY(0) !important; }
                .cabecalho.scrolled {
                    background: rgba(10, 12, 14, 0.96) !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(0, 117, 255, 0.25) !important;
                    border-bottom-color: rgba(0, 117, 255, 0.4) !important;
                }
                #toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; }
                .toast-item { background: #0D1117; color: #FFF; border: 1px solid #1F242C; padding: 14px 22px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; box-shadow: 0 10px 30px rgba(0,0,0,0.6); opacity: 0; transform: translateY(15px); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                .toast-item.show { opacity: 1; transform: translateY(0); }
                .toast-error { border-left: 4px solid #FF4D4D; }
                .toast-success { border-left: 4px solid #25D366; }
                .toast-info { border-left: 4px solid #0075FF; }
            `;
            document.head.appendChild(style);
        }
    };

    // ==========================================
    // 7. ORQUESTRADOR PRINCIPAL (APP INIT)
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        UIManager.init();

        const formElement = document.getElementById('form-orcamento') || document.querySelector('.formulario-contato form');
        if (formElement) {
            const fsm = new FormStateMachine(formElement);

            formElement.addEventListener('submit', (event) => {
                event.preventDefault();
                const button = document.getElementById('btn-whatsapp');
                if (button) button.click();
            });

            const btnWa = document.getElementById('btn-whatsapp');
            if (btnWa) {
                btnWa.addEventListener('click', () => {
                    const data = fsm.validate();
                    if (!data) return;

                    System.vibrate([40]);
                    System.log('DispatchWhatsApp', data);

                    let msg = `*NOVO AGENDAMENTO VIA SITE* 🚗⚡\n`;
                    msg += `------------------------------------\n`;
                    msg += `👤 *Cliente:* ${data.nome}\n`;
                    msg += `📞 *Contato:* ${data.telefone}\n`;
                    msg += `🚘 *Veículo:* ${data.veiculo}\n`;
                    msg += `🔧 *Serviço:* ${data.mensagem}\n`;
                    msg += `------------------------------------`;

                    const whatsappUrl = `https://wa.me/5584996388492?text=${encodeURIComponent(msg)}`;
                    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                    Toast.show('🚀 Abrindo WhatsApp...', 'success');
                });
            }

            const btnIg = document.getElementById('btn-instagram');
            if (btnIg) {
                btnIg.addEventListener('click', async () => {
                    const data = fsm.validate();
                    if (!data) return;

                    System.vibrate([40]);
                    System.log('DispatchInstagram', data);

                    let msg = `Olá! Agendamento via site:\n\n• Nome: ${data.nome}\n• Contato: ${data.telefone}\n• Veículo: ${data.veiculo}\n• Serviço: ${data.mensagem}`;

                    const copied = await System.copyText(msg);
                    if (copied) {
                        Toast.show('📋 Mensagem copiada! Cole no Direct do Instagram.', 'success');
                    }
                    setTimeout(() => window.open(CONFIG.instagramUrl, '_blank', 'noopener,noreferrer'), 600);
                });
            }
        }

        if (window.lucide) lucide.createIcons();
        System.log('AppInitialized');
    });

})();
