package ai.enclawed.app.ui

import androidx.compose.runtime.Composable
import ai.enclawed.app.MainViewModel
import ai.enclawed.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
