const mineflayer = require('mineflayer');
const {Realms, PRealms} = require('mc-realms');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const { pathfinder, Movements} = require('mineflayer-pathfinder');
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow, GoalGetToBlock} = require('mineflayer-pathfinder').goals
const autoeat = require('mineflayer-auto-eat');
const {Vec3} = require("vec3");
const pvp = require('mineflayer-pvp').plugin;
const toolPlugin = require('mineflayer-tool').plugin;

const State = {
  "PATHING": 1,
  "MINING": 2,
  "STORING": 3,
  "HOLD": 4
};
const PathingState = {
  "TUNNEL": 1,
  "BRANCH_LEFT": 2,
  "BRANCH_RIGHT": 3,
  "RETURNING": 4,
  "DESCEND": 5
}
const TARGET_ORES = [
  'diamond_ore',
  'iron_ore',
  'gold_ore'
]
let bot = null;
let state = State.HOLD;
let pathing_state = State.TUNNEL;
let tunnel_center = new GoalBlock(0, 0, 0);
let at_goal = false;
let current_target = null;
let target_block_queue = [];

let defaultMove = null;
let mcData = null;
const varToString = varObj => Object.keys(varObj)[0];
let target_ids = null;



const realms = new Realms("swordsnclaws@verizon.net", "1.16.5");
const server_list = []

// realms.login('G0ldF!v30n3', data=>{
//   if (!data.error) {
//     console.log("Login success");
//     realms.get_addrs(servers_data=>{
//       if (!servers_data.error) {
//         const server = servers_data.server;
//         console.log("Server found:", server.name);
//         if(server.owner === 'lilgibbby') {
//           runBot(server.addr.host, server.addr.port);
//         }
//       } else {
//         console.log("Error retreiving realms address:", servers_data.error);
//       }
//     });
//   } else {
//     console.log("Login error:", data.error);
//   }
// });

runBot('localhost', '7833');

function runBot(host, port) {
  console.log("Starting bot on", host, port);

  const options = {
    host: host,
    port: port,
    hideErrors: false,
    version: '1.16.5',
    // username: 'SilentWanderer',
    // password: 'G0ldF!v30n3'
    username: 'bot'
  };

  bot = mineflayer.createBot(options);
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(autoeat);

  bot.once('spawn', () => {
    console.log("Connected");
    mineflayerViewer(bot, { port: 3007, firstPerson: false }) // port is the minecraft server port, if first person is false, you get a bird's-eye view
  });

  bot.on('chat', (user, message, translate, json, matches) => {
    if(user !== 'SilentWanderer') return;
    if(message === 'start') {
      console.log('Starting bot');

      // Once we've spawn, it is safe to access mcData because we know the version
      mcData = require('minecraft-data')(bot.version)
      // Create list of target block ids
      target_ids = TARGET_ORES.map(value => mcData.blocksByName[value].id);
      console.log("Generated target block IDs: ", target_ids);
      // We create different movement generators for different type of activity
      defaultMove = new Movements(bot, mcData)
      bot.pathfinder.setMovements(defaultMove);

      state = State.PATHING;
      if(pos().y > 11) {
        console.log('Descending to y=11');
        goto(new GoalBlock(pos().x, 11, pos().y)).then(()=>tunnel());
      } else {
        console.log('Tunneling');
        tunnel();
      }
    }
    if(message === 'update') {
      update()
    }
    if(message === 'state') {
      bot.chat(state);
    }
    if(message === 'state pathing') {
      bot.chat(pathing_state);
    }
  })

  bot.on('goal_reached', (goal)=>{
    console.log('Goal reached: ', goal, pathing_state);
    // setTimeout(()=>update(), 10);
  });

  // bot.on('path_update', (results)=>{
  //   console.log('Pathing stopped: ', results.status);
  // })

  bot.on('goal_updated', (goal, dynamic)=>{
    console.log("Goal updated: ", goal, dynamic);
  })

  // Handle mining here
  bot.on('physicsTick', ()=>{
    const current_pos = bot.entity.position;
    if(state !== State.MINING) {
      target_block_queue = getTargetBlocks()
      // console.log(target_block_queue);
      if(target_block_queue && target_block_queue.length ) {
        console.log("Changing to mining state");
        state = State.MINING;
        goto(new GoalBlock(current_pos.x, current_pos.y, current_pos.z))
            .then(()=>{
              updateMining();
            })
            .then(()=>{
              if(target_block_queue.length === 0) {
                console.log("Changing to pathing state");
                state = State.PATHING;
                tunnel();
              }
            });
      }
    }
  });

  // Setup autoeat
  // bot.once('spawn', () => {
  //   bot.autoEat.options = {
  //     priority: 'foodPoints',
  //     startAt: 14,
  //     bannedFood: []
  //   }
  // });
  // bot.on('autoeat_started', () => {
  //   console.log('Auto Eat started!')
  // });
  // bot.on('autoeat_stopped', () => {
  //   console.log('Auto Eat stopped!')
  // });
  // bot.on('health', () => {
  //   if (bot.food === 20) bot.autoEat.disable()
  //   // Disable the plugin if the bot is at 20 food points
  //   else bot.autoEat.enable() // Else enable the plugin again
  // });
}

function getTargetBlocks() {
  return bot.findBlocks({matching: target_ids, maxDistance: 6, count: 32});
}

// function update() {
//   switch(state) {
//     case State.MINING:
//       updateMining();
//       break;
//     case State.PATHING:
//       updatePathing();
//       break;
//   }
// }

function updateMining() {
  if(target_block_queue.length > 0) {
    if(!bot.targetDigBlock) {
      current_target = bot.blockAt(target_block_queue.pop());
      return goto(new GoalGetToBlock(current_target.position.x, current_target.position.y, current_target.position.z))
          .then(()=>{
            console.log("Digging target", current_target.name, current_target.position);
            bot.dig(current_target, true, (err)=>{
              if(err) {
                console.log(err.stack);
              }
              console.log("Finished digging block", current_target.name, target_block_queue);
            });
          })
          .then(()=>updateMining());

    }
  }
  if(target_block_queue.length === 0) {
    console.log("Changing to pathing state");
    state = State.PATHING;
  }
}

function tunnel() {
  console.log('tunnelling');
  return goto(new GoalBlock(pos().x + 5, 11, pos().z))
      .then(()=>branch_left());
}

function branch_left() {
  console.log('branch left');
  tunnel_center = new Vec3(pos().x, 11, pos().z);
  return goto(new GoalBlock(tunnel_center.x, tunnel_center.y, tunnel_center.z - 5))
      .then(()=>branch_right());
}

function branch_right() {
  console.log('branch right');
  return goto(new GoalBlock(tunnel_center.x, tunnel_center.y, tunnel_center.z + 5))
      .then(()=>goto(new GoalBlock(tunnel_center.x, tunnel_center.y, tunnel_center.z)))
      .then(()=>tunnel());
}

function pos() {
  return bot.entity.position;
}

function goto(goal) {
  // at_goal = false;
  // return new Promise((resolve, reject) => {
  //   bot.pathfinder.goto(goal, () => {
  //     resolve();
  //     at_goal = true;
  //   });
  // });
  return bot.pathfinder.goto(goal).catch((err) => {
    console.log('Pathing error:', err);
  });
}

function goto_pos(pos) {
  return goto(new GoalBlock(pos.x, pos.y, pos.z));
}