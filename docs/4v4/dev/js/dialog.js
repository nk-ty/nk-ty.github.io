// アプリ内ダイアログ（<dialog>）。window.confirm の代わりに使う。
// 外側タップ・Escで閉じると「キャンセル」扱い。

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    // role は古いブラウザでプロパティ反映がないため属性で設定する
    if (key === 'role') node.setAttribute('role', value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

function openDialog(build) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    let result = null;
    const finish = (value) => {
      result = value;
      dlg.close();
    };
    dlg.append(build(finish));
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) finish(null); // 背景タップ
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

function button(label, className, action, onClick) {
  const b = el('button', { type: 'button', className: `btn ${className}`, textContent: label });
  b.dataset.action = action;
  b.addEventListener('click', onClick);
  return b;
}

// 確認ダイアログ。OKなら true、キャンセル・外側タップなら false。
export function confirmDialog({ title, message, okLabel = 'OK', cancelLabel = 'キャンセル', danger = false }) {
  return openDialog((finish) => {
    const actions = el(
      'div',
      { className: 'dlg-actions' },
      button(cancelLabel, 'btn-ghost', 'cancel', () => finish(null)),
      button(okLabel, danger ? 'btn-danger' : 'btn-primary', 'ok', () => finish('ok')),
    );
    return el(
      'div',
      { className: 'dlg-body', role: 'document' },
      el('h2', { className: 'dlg-title', textContent: title }),
      el('p', { className: 'dlg-msg', textContent: message }),
      actions,
    );
  }).then((v) => v === 'ok');
}

function segmented(name, options, value) {
  const wrap = el('div', { className: 'seg-group', role: 'radiogroup' });
  for (const [val, label] of options) {
    const input = el('input', { type: 'radio', name, value: String(val), checked: String(val) === String(value) });
    wrap.append(el('label', { className: 'seg' }, input, el('span', { textContent: label })));
  }
  return wrap;
}

function numberField(label, value, max) {
  const input = el('input', {
    type: 'number',
    inputMode: 'numeric',
    min: '0',
    max: String(max),
    value: String(value),
  });
  input.setAttribute('aria-label', label);
  return { input, node: el('label', { className: 'num' }, input, el('span', { textContent: label })) };
}

// 得点イベントの修正ダイアログ。
// 戻り値: { action: 'save', team, points, elapsedSec } | { action: 'delete' } | null（キャンセル）
export function editEventDialog(ev, teamLabels) {
  return openDialog((finish) => {
    const teamGroup = segmented('team', [['my', teamLabels.my], ['opp', teamLabels.opp]], ev.team);
    const pointsGroup = segmented('points', [[2, '2点'], [3, '3点']], ev.points);
    const min = numberField('分', Math.floor(ev.elapsedSec / 60), 999);
    const sec = numberField('秒', ev.elapsedSec % 60, 59);
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });

    const checked = (group) => group.querySelector('input:checked')?.value;

    const save = () => {
      const m = Number(min.input.value);
      const s = Number(sec.input.value);
      const valid =
        min.input.value !== '' &&
        sec.input.value !== '' &&
        Number.isInteger(m) &&
        Number.isInteger(s) &&
        m >= 0 &&
        m <= 999 &&
        s >= 0 &&
        s <= 59;
      if (!valid) {
        error.textContent = '時間は 分(0〜999)・秒(0〜59) の整数で入力してください';
        error.hidden = false;
        return;
      }
      finish({
        action: 'save',
        team: checked(teamGroup),
        points: Number(checked(pointsGroup)),
        elapsedSec: m * 60 + s,
      });
    };

    // 削除は誤タップ防止のため2回タップで実行
    let armed = false;
    const del = button('削除', 'btn-danger-ghost', 'delete', () => {
      if (!armed) {
        armed = true;
        del.textContent = 'もう一度タップで削除';
        return;
      }
      finish({ action: 'delete' });
    });

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: '得点を修正' }),
      el('div', { className: 'dlg-field' }, el('p', { className: 'dlg-label', textContent: 'チーム' }), teamGroup),
      el('div', { className: 'dlg-field' }, el('p', { className: 'dlg-label', textContent: '点数' }), pointsGroup),
      el(
        'div',
        { className: 'dlg-field' },
        el('p', { className: 'dlg-label', textContent: '時間' }),
        el('div', { className: 'num-row' }, min.node, sec.node),
      ),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
      del,
    );
  });
}

// 試合時間（分）の設定ダイアログ。
// 戻り値: { minutes } | null（キャンセル）
export function durationDialog(currentMinutes, { min, max, presets }) {
  return openDialog((finish) => {
    const field = numberField('分', currentMinutes, max);
    field.input.min = String(min);
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });

    const presetRow = el(
      'div',
      { className: 'preset-row' },
      ...presets.map((m) => {
        const b = button(`${m}分`, 'btn-ghost btn-preset', 'preset', () => {
          field.input.value = String(m);
          error.hidden = true;
        });
        b.dataset.minutes = String(m);
        return b;
      }),
    );

    const save = () => {
      const raw = field.input.value;
      const m = Number(raw);
      if (raw === '' || !Number.isInteger(m) || m < min || m > max) {
        error.textContent = `試合時間は ${min}〜${max} 分の整数で入力してください`;
        error.hidden = false;
        return;
      }
      finish({ minutes: m });
    };

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: '試合時間' }),
      el('p', {
        className: 'dlg-msg',
        textContent: '分単位で設定します。残り時間が0になったら、超過した時間を表示しながらタイマーを進めます。',
      }),
      presetRow,
      el('div', { className: 'dlg-field' }, el('div', { className: 'num-row' }, field.node)),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
    );
  });
}

// 交代間隔（分）の設定ダイアログ。0 は通知オフ。
// 戻り値: { minutes } | null（キャンセル）
export function swapDialog(currentMinutes, { max, presets, warnSec }) {
  return openDialog((finish) => {
    const field = numberField('分ごと', currentMinutes, max);
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });

    const presetRow = el(
      'div',
      { className: 'preset-row' },
      ...presets.map((m) => {
        const b = button(m === 0 ? 'オフ' : `${m}分`, 'btn-ghost btn-preset', 'preset', () => {
          field.input.value = String(m);
          error.hidden = true;
        });
        b.dataset.minutes = String(m);
        return b;
      }),
    );

    const save = () => {
      const raw = field.input.value;
      const m = Number(raw);
      if (raw === '' || !Number.isInteger(m) || m < 0 || m > max) {
        error.textContent = `交代間隔は 0〜${max} 分の整数で入力してください（0でオフ）`;
        error.hidden = false;
        return;
      }
      finish({ minutes: m });
    };

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: '交代の通知' }),
      el('p', {
        className: 'dlg-msg',
        textContent: `タイマーが動いている間、交代の${warnSec}秒前と交代の時刻に、音・振動・画面表示で知らせます。\n例: 5分ごと → 4:45 と 5:00、9:45 と 10:00 …（試合開始からの時間）`,
      }),
      presetRow,
      el('div', { className: 'dlg-field' }, el('div', { className: 'num-row' }, field.node)),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
    );
  });
}

// メンバーの追加・編集ダイアログ。member が null なら追加。
// validate(name) は問題なければ null、あればエラーメッセージを返す。
// 戻り値: { action: 'save', name } | { action: 'delete' } | null（キャンセル）
export function memberDialog(member, { validate, maxLen }) {
  return openDialog((finish) => {
    const input = el('input', { type: 'text', value: member ? member.name : '', maxLength: maxLen * 2 });
    input.setAttribute('aria-label', '名前');
    input.setAttribute('autocomplete', 'off');
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });

    const save = () => {
      const message = validate(input.value);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      finish({ action: 'save', name: input.value });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });

    let del = null;
    if (member) {
      let armed = false;
      del = button('削除', 'btn-danger-ghost', 'delete', () => {
        if (!armed) {
          armed = true;
          del.textContent = 'もう一度タップで削除';
          return;
        }
        finish({ action: 'delete' });
      });
    }

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: member ? 'メンバーを編集' : 'メンバーを追加' }),
      el('div', { className: 'dlg-field' }, el('label', { className: 'text-field' }, input)),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
      ...(del ? [del] : []),
    );
  });
}

// チップで複数選択する部品。max を超えて選べず、isBlocked(id) が true の人は選べない。
function chipPicker(choices, selected, { max = Infinity, side = '', isBlocked = () => false, onChange = () => {} } = {}) {
  let picked = [...selected];
  const wrap = el('div', { className: 'chips' });
  if (side) wrap.dataset.side = side;
  const render = () => {
    const full = picked.length >= max;
    wrap.replaceChildren(
      ...choices.map((m) => {
        const on = picked.includes(m.id);
        const b = el('button', { type: 'button', className: 'chip', textContent: m.name, disabled: !on && (full || isBlocked(m.id)) });
        b.dataset.id = m.id;
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => {
          picked = on ? picked.filter((x) => x !== m.id) : [...picked, m.id];
          render();
          onChange();
        });
        return b;
      }),
    );
  };
  render();
  return { node: wrap, get: () => picked, render };
}

function teamSelect(teams, value, label, noneLabel) {
  const sel = el('select', { className: 'team-select' });
  sel.setAttribute('aria-label', label);
  sel.append(el('option', { value: '', textContent: noneLabel }));
  for (const t of teams) sel.append(el('option', { value: t.id, textContent: t.name }));
  sel.value = value ?? '';
  return sel;
}

// チームの追加・編集ダイアログ。team が null なら追加。メンバーは何人でも選べる（兼任可）。
// 戻り値: { action: 'save', name, memberIds } | { action: 'delete' } | null
export function teamDialog(team, { members, validate, maxLen }) {
  return openDialog((finish) => {
    const input = el('input', { type: 'text', value: team ? team.name : '', maxLength: maxLen * 2 });
    input.setAttribute('aria-label', 'チーム名');
    input.setAttribute('autocomplete', 'off');
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });
    const picker = chipPicker(members, team ? team.memberIds : []);

    const save = () => {
      const message = validate(input.value);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      finish({ action: 'save', name: input.value, memberIds: picker.get() });
    };

    let del = null;
    if (team) {
      let armed = false;
      del = button('チームを削除', 'btn-danger-ghost', 'delete', () => {
        if (!armed) {
          armed = true;
          del.textContent = 'もう一度タップで削除';
          return;
        }
        finish({ action: 'delete' });
      });
    }

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: team ? 'チームを編集' : 'チームを追加' }),
      el('div', { className: 'dlg-field' }, el('p', { className: 'dlg-label', textContent: 'チーム名' }), el('label', { className: 'text-field' }, input)),
      el(
        'div',
        { className: 'dlg-field' },
        el('p', { className: 'dlg-label', textContent: 'メンバー（ほかのチームと兼任できます）' }),
        members.length > 0 ? picker.node : el('p', { className: 'dlg-note', textContent: '先に下の「メンバー」でメンバーを登録してください' }),
      ),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
      ...(del ? [del] : []),
    );
  });
}

// 終了した試合の編集・手入力ダイアログ。record が null なら新規（手入力）。
// teams は選べるチーム [{id,name}]、choices は選べるメンバー [{id,name}]。
// 戻り値: { action: 'save', finishedAtMs, my, opp, myTeamId, oppTeamId, myIds, oppIds } | { action: 'delete' } | null
export function recordDialog(record, { initial, teams, choices, maxMembers, maxScore, toInput, fromInput, note }) {
  return openDialog((finish) => {
    const when = el('input', { type: 'datetime-local', value: toInput(initial.finishedAtMs) });
    when.setAttribute('aria-label', '日時');
    const my = numberField('自分側', initial.my, maxScore);
    const opp = numberField('相手側', initial.opp, maxScore);
    const error = el('p', { className: 'dlg-error', hidden: true, role: 'alert' });

    const mySel = teamSelect(teams, initial.myTeamId, '自分側のチーム', 'チームなし（自チーム）');
    const oppSel = teamSelect(teams, initial.oppTeamId, '相手側のチーム', 'チームなし（相手）');
    // 同じ人を両側に選べない
    let myPick = null;
    let oppPick = null;
    myPick = chipPicker(choices, initial.myIds, { max: maxMembers, side: 'my', isBlocked: (id) => oppPick?.get().includes(id), onChange: () => oppPick?.render() });
    oppPick = chipPicker(choices, initial.oppIds, { max: maxMembers, side: 'opp', isBlocked: (id) => myPick.get().includes(id), onChange: () => myPick.render() });
    myPick.render();

    const save = () => {
      const at = fromInput(when.value);
      const a = Number(my.input.value);
      const b = Number(opp.input.value);
      const okScore = (raw, n) => raw !== '' && Number.isInteger(n) && n >= 0 && n <= maxScore;
      if (at === null) {
        error.textContent = '日時を入力してください';
      } else if (!okScore(my.input.value, a) || !okScore(opp.input.value, b)) {
        error.textContent = `得点は 0〜${maxScore} の整数で入力してください`;
      } else if (mySel.value !== '' && mySel.value === oppSel.value) {
        error.textContent = '同じチームを両側に選べません';
      } else {
        finish({
          action: 'save',
          finishedAtMs: at,
          my: a,
          opp: b,
          myTeamId: mySel.value || null,
          oppTeamId: oppSel.value || null,
          myIds: myPick.get(),
          oppIds: oppPick.get(),
        });
        return;
      }
      error.hidden = false;
    };

    let del = null;
    if (record) {
      let armed = false;
      del = button('この試合を削除', 'btn-danger-ghost', 'delete', () => {
        if (!armed) {
          armed = true;
          del.textContent = 'もう一度タップで削除';
          return;
        }
        finish({ action: 'delete' });
      });
    }

    const field = (label, ...children) =>
      el('div', { className: 'dlg-field' }, el('p', { className: 'dlg-label', textContent: label }), ...children);
    const noMembers = () => el('p', { className: 'dlg-note', textContent: 'メンバーは「チーム」タブで登録できます' });

    return el(
      'div',
      { className: 'dlg-body' },
      el('h2', { className: 'dlg-title', textContent: record ? '試合を編集' : '試合を手入力' }),
      field('日時', el('label', { className: 'text-field' }, when)),
      field('スコア（自分側 - 相手側）', el('div', { className: 'num-row score-inputs' }, my.node, opp.node)),
      ...(note ? [el('p', { className: 'dlg-note', textContent: note })] : []),
      field('自分側', mySel, choices.length > 0 ? myPick.node : noMembers()),
      field('相手側', oppSel, choices.length > 0 ? oppPick.node : noMembers()),
      el('p', { className: 'dlg-note', textContent: `メンバーは各側 最大${maxMembers}人` }),
      error,
      el(
        'div',
        { className: 'dlg-actions' },
        button('キャンセル', 'btn-ghost', 'cancel', () => finish(null)),
        button('保存', 'btn-primary', 'save', save),
      ),
      ...(del ? [del] : []),
    );
  });
}
