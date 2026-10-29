window.__ModuleLoader__.load({
  id: '@botharness/appearance-qa/client',
  factory: (require) => {
    const React = require('react');
    return {
      name: 'appearance-qa-client',
      inject: ['dockPanels'],
      apply(ctx) {
        ctx.effect(() => {
          let release;
          const register = () => {
            release ??= ctx.dockPanels.register({
              id: 'appearance-qa:sample',
              title: 'Independent appearance sample',
              scope: 'global',
              icon: 'palette',
              component: () =>
                React.createElement(
                  'div',
                  { 'data-independent-sample': '' },
                  React.createElement('p', null, 'Independent Plugin content'),
                  React.createElement('input', {
                    'aria-label': 'Independent draft',
                    defaultValue: 'Keep my content',
                  }),
                  React.createElement('div', {
                    style: { background: '#ed4235', width: 80, height: 80 },
                    'data-independent-pixel': '',
                  }),
                ),
            });
          };
          register();
          const control = ctx.dockPanels.register({
            id: 'appearance-qa:control',
            title: 'Independent appearance control',
            scope: 'global',
            component: () =>
              React.createElement(
                'div',
                null,
                React.createElement(
                  'button',
                  {
                    onClick: () => {
                      release?.();
                      release = undefined;
                    },
                  },
                  'Unregister sample',
                ),
                React.createElement(
                  'button',
                  {
                    onClick: () => {
                      register();
                      ctx.dockPanels.open('appearance-qa:sample');
                    },
                  },
                  'Register sample',
                ),
              ),
          });
          return () => {
            release?.();
            control();
          };
        });
      },
    };
  },
});
